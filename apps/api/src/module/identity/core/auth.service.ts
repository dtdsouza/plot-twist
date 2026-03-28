import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource, MoreThan } from 'typeorm'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'node:crypto'
import { UserEntity } from '../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../persistence/entity/password-reset-token.entity'
import { EUserStatus } from '../persistence/enum/user-status.enum'
import { RegisterDto } from '../http/dto/register.dto'
import { LoginDto } from '../http/dto/login.dto'
import { IAuthResponse, IUserResponse } from '../http/dto/auth-response.interface'
import { EMAIL_SERVICE, type IEmailService } from '../../../infra/mail/interface/email-service.interface'
import { MAIL_CONFIG_KEY, type IMailConfig } from '../../../infra/config/segment/mail.config'

const BCRYPT_SALT_ROUNDS = 12
const TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Identity.AuthService')
  private readonly passwordResetUrl: string

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly tokenRepository: Repository<PasswordResetTokenEntity>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: IEmailService,
    configService: ConfigService,
  ) {
    const mailConfig = configService.getOrThrow<IMailConfig>(MAIL_CONFIG_KEY)
    this.passwordResetUrl = mailConfig.passwordResetUrl
  }

  async register(dto: RegisterDto): Promise<IAuthResponse> {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    })

    if (existingUser) {
      throw new ConflictException('A user with this email already exists')
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS)

    const entity = this.userRepository.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
    })

    const savedUser = await this.userRepository.save(entity)

    this.logger.log(`User registered: ${savedUser.id}`)

    return this.buildAuthResponse(savedUser)
  }

  async login(dto: LoginDto): Promise<IAuthResponse> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    })

    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash)

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials')
    }

    this.logger.log(`User logged in: ${user.id}`)

    return this.buildAuthResponse(user)
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email },
    })

    if (!user || user.status !== EUserStatus.ACTIVE) {
      this.logger.log('Password reset requested for non-existent or inactive email')
      return
    }

    // Invalidate all previous tokens for this user
    await this.tokenRepository.delete({ userId: user.id })

    // Generate cryptographically secure token
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex')

    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS)

    const tokenEntity = this.tokenRepository.create({
      tokenHash,
      userId: user.id,
      expiresAt,
    })

    await this.tokenRepository.save(tokenEntity)

    // Send reset email — failures are logged but do not propagate
    const resetUrl = `${this.passwordResetUrl}?token=${rawToken}`

    try {
      await this.emailService.send({
        to: user.email,
        subject: 'Reset your Plot-Twist password',
        html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, you can safely ignore this email.</p>`,
        text: `You requested a password reset. Visit this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`,
      })
    } catch (error) {
      this.logger.error('Failed to send password reset email', error)
    }

    this.logger.log(`Password reset token created for user: ${user.id}`)
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex')

    const tokenEntity = await this.tokenRepository.findOne({
      where: {
        tokenHash,
        expiresAt: MoreThan(new Date()),
      },
    })

    if (!tokenEntity) {
      this.logger.warn('Password reset attempted with invalid or expired token')
      throw new BadRequestException('Invalid or expired reset token')
    }

    const user = await this.userRepository.findOne({
      where: { id: tokenEntity.userId },
    })

    if (!user || user.status !== EUserStatus.ACTIVE) {
      this.logger.warn('Password reset attempted for inactive user')
      throw new BadRequestException('Invalid or expired reset token')
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS)

    await this.dataSource.transaction(async (manager) => {
      await manager.update(UserEntity, { id: user.id }, { passwordHash })
      await manager.delete(PasswordResetTokenEntity, { id: tokenEntity.id })
    })

    this.logger.log(`Password reset successful for user: ${user.id}`)
  }

  private buildAuthResponse(user: UserEntity): IAuthResponse {
    const payload = { sub: user.id, email: user.email }
    const accessToken = this.jwtService.sign(payload)

    return {
      accessToken,
      user: this.toUserResponse(user),
    }
  }

  private toUserResponse(user: UserEntity): IUserResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      createdAt: user.createdAt,
    }
  }
}
