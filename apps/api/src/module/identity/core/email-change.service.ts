import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'node:crypto'
import { UserEntity } from '../persistence/entity/user.entity'
import { EmailChangeTokenEntity } from '../persistence/entity/email-change-token.entity'
import { UserRepository } from '../persistence/repository/user.repository'
import { EmailChangeTokenRepository } from '../persistence/repository/email-change-token.repository'
import { EmailChangeInitiateDto } from '../http/dto/email-change-initiate.dto'
import { EmailClient } from '@module/shared/mail'
import { MAIL_CONFIG_KEY, type IMailConfig } from '@module/shared/config'
import { buildEmailChangeVerificationEmail } from '../mail/email-change.template'

const TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

export interface IEmailChangeInitiateResult {
  readonly message: string
}

export interface IEmailChangeVerifyResult {
  readonly message: string
  readonly email: string
}

@Injectable()
export class EmailChangeService {
  private readonly logger = new Logger('Identity.EmailChangeService')
  private readonly verificationUrl: string

  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenRepository: EmailChangeTokenRepository,
    private readonly dataSource: DataSource,
    private readonly emailClient: EmailClient,
    configService: ConfigService,
  ) {
    const mailConfig = configService.getOrThrow<IMailConfig>(MAIL_CONFIG_KEY)
    this.verificationUrl = mailConfig.emailChangeVerificationUrl
  }

  async initiate(
    userId: string,
    dto: EmailChangeInitiateDto,
  ): Promise<IEmailChangeInitiateResult> {
    const user = await this.userRepository.findOne({ id: userId })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    )

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password incorrect')
    }

    if (dto.newEmail === user.email) {
      throw new BadRequestException('New email matches current email')
    }

    const existing = await this.userRepository.findOne({ email: dto.newEmail })

    // We return 409 Conflict on duplicate email. This trades the (small) risk
    // of email enumeration for clearer UX on the profile screen, which is the
    // only place an authenticated user can hit this endpoint.
    if (existing) {
      throw new ConflictException('That email is unavailable')
    }

    // One pending change per user -- wipe any previous tokens before issuing.
    await this.tokenRepository.deleteAllForUser(user.id)

    const rawToken = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex')

    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS)

    await this.tokenRepository.create({
      userId: user.id,
      tokenHash,
      newEmail: dto.newEmail,
      expiresAt,
    })

    const verificationUrl = `${this.verificationUrl}?token=${rawToken}`

    try {
      await this.emailClient.send(
        buildEmailChangeVerificationEmail({
          to: dto.newEmail,
          verificationUrl,
        }),
      )
    } catch (error) {
      this.logger.error('Failed to send email change verification', error)
    }

    this.logger.log(`Email change initiated for user: ${user.id}`)

    return { message: 'Check your new inbox' }
  }

  async verify(rawToken: string): Promise<IEmailChangeVerifyResult> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex')

    const tokenEntity = await this.tokenRepository.findValidByTokenHash(tokenHash)

    if (!tokenEntity) {
      this.logger.warn('Email change verification attempted with invalid or expired token')
      throw new HttpException('Link expired or invalid', HttpStatus.GONE)
    }

    if (tokenEntity.expiresAt.getTime() < Date.now()) {
      throw new HttpException('Link expired or invalid', HttpStatus.GONE)
    }

    // JWT invalidation deferred -- existing tokens carry stale email until expiry
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        UserEntity,
        { id: tokenEntity.userId },
        { email: tokenEntity.newEmail },
      )
      await manager.delete(EmailChangeTokenEntity, { id: tokenEntity.id })
    })

    this.logger.log(`Email changed for user: ${tokenEntity.userId}`)

    return { message: 'Email updated', email: tokenEntity.newEmail }
  }
}
