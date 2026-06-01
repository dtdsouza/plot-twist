import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import * as crypto from 'node:crypto'
import { DataSource } from 'typeorm'
import { EmailClient } from '@module/shared/mail'
import { CLUBS_CONFIG_KEY, type IClubsConfig } from '@module/shared/config'
import { ClubInviteRepository } from '../persistence/repository/club-invite.repository'
import { ClubRepository } from '../persistence/repository/club.repository'
import { MembershipRepository } from '../persistence/repository/membership.repository'
import { EMembershipRole } from '../persistence/enum/membership-role.enum'
import type { ClubInviteEntity } from '../persistence/entity/club-invite.entity'
import type { ClubEntity } from '../persistence/entity/club.entity'
import { buildClubInviteEmail } from './notifications/club-invite.template'

export interface IClubInvitePreview {
  readonly clubId: string
  readonly name: string
  readonly coverImageUrl: string | null
  readonly memberCount: number
}

export interface IClubInviteResult {
  readonly token: string
  readonly url: string
  readonly expiresAt: Date | null
}

@Injectable()
export class ClubInviteService {
  private readonly logger = new Logger('Clubs.ClubInviteService')
  private readonly inviteUrl: string
  private readonly inviteExpiryDays: number

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly clubInviteRepository: ClubInviteRepository,
    private readonly clubRepository: ClubRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly emailClient: EmailClient,
    configService: ConfigService,
  ) {
    const config = configService.getOrThrow<IClubsConfig>(CLUBS_CONFIG_KEY)
    this.inviteUrl = config.inviteUrl
    this.inviteExpiryDays = config.inviteExpiryDays
  }

  // D3: Owner-only — null role means not a member (404); non-owner role means Forbidden (403).
  async getOrCreateActive(
    clubId: string,
    ownerId: string,
  ): Promise<IClubInviteResult> {
    await this.requireOwner(clubId, ownerId)

    const existing = await this.clubInviteRepository.findActiveByClub(clubId)
    if (existing) {
      return this.toResult(existing)
    }

    const fresh = await this.createFreshInvite(clubId, ownerId)
    return this.toResult(fresh)
  }

  // D1: In ONE transaction: revoke current + insert new.
  async rotate(clubId: string, ownerId: string): Promise<IClubInviteResult> {
    await this.requireOwner(clubId, ownerId)

    const entity = await this.dataSource.transaction(async (manager) => {
      await this.clubInviteRepository.revokeActiveForClub(manager, clubId)
      return this.clubInviteRepository.insert({
        clubId,
        token: this.generateToken(),
        createdByUserId: ownerId,
        expiresAt: this.buildExpiresAt(),
        revokedAt: null,
      })
    })
    return this.toResult(entity)
  }

  // No-op if none active.
  async revoke(clubId: string, ownerId: string): Promise<void> {
    await this.requireOwner(clubId, ownerId)

    const active = await this.clubInviteRepository.findActiveByClub(clubId)
    if (!active) {
      return
    }

    await this.clubInviteRepository.update(active.id, { revokedAt: new Date() })
  }

  // D5: Public endpoint — no ownership check. Returns minimal summary.
  async preview(token: string): Promise<IClubInvitePreview> {
    const invite = await this.clubInviteRepository.findActiveByToken(token)
    if (!invite) {
      throw new HttpException('Link expired or invalid', HttpStatus.GONE)
    }

    const club = await this.clubRepository.findOne({ id: invite.clubId })
    if (!club) {
      throw new HttpException('Link expired or invalid', HttpStatus.GONE)
    }

    const memberCount = await this.membershipRepository.countByClub(invite.clubId)

    return Object.freeze({
      clubId: club.id,
      name: club.name,
      coverImageUrl: club.coverImageUrl,
      memberCount,
    })
  }

  // D4: Idempotent join — already a member returns the club without inserting.
  // Catches unique-violation (23505) as backstop for race conditions.
  async redeem(token: string, userId: string): Promise<ClubEntity> {
    const invite = await this.clubInviteRepository.findActiveByToken(token)
    if (!invite) {
      throw new HttpException('Link expired or invalid', HttpStatus.GONE)
    }

    const role = await this.membershipRepository.findRoleForUser(invite.clubId, userId)
    if (role !== null) {
      // Already a member (any role, including owner) — idempotent success.
      const club = await this.clubRepository.findOne({ id: invite.clubId })
      if (!club) {
        throw new HttpException('Link expired or invalid', HttpStatus.GONE)
      }
      return club
    }

    try {
      await this.membershipRepository.createMemberMembership(invite.clubId, userId)
    } catch (error: unknown) {
      // Unique-violation: race condition where two requests arrive simultaneously.
      if (this.isUniqueViolation(error)) {
        this.logger.log('Idempotent join: membership already exists', { clubId: invite.clubId, userId })
      } else {
        throw error
      }
    }

    // TODO(events): emit MemberJoined { clubId: invite.clubId, userId, occurredAt: new Date() }
    // Deferred per design.md D5 + Non-Goals; will land alongside the first consumer (Discussions).

    const club = await this.clubRepository.findOne({ id: invite.clubId })
    if (!club) {
      throw new HttpException('Link expired or invalid', HttpStatus.GONE)
    }
    return club
  }

  // D7: Best-effort email — send failures are logged and do NOT throw.
  async email(clubId: string, ownerId: string, emails: string[]): Promise<void> {
    await this.requireOwner(clubId, ownerId)

    const invite = await this.getOrCreateActive(clubId, ownerId)
    const club = await this.clubRepository.findOne({ id: clubId })
    if (!club) {
      throw new NotFoundException('Club not found')
    }

    for (const to of emails) {
      try {
        await this.emailClient.send(
          buildClubInviteEmail({ to, clubName: club.name, inviteUrl: invite.url }),
        )
      } catch (error) {
        this.logger.error('Failed to send club invite email', { to, clubId, error })
      }
    }
  }

  // D3: null role => not a member => 404; non-owner role => 403.
  private async requireOwner(clubId: string, ownerId: string): Promise<void> {
    const role = await this.membershipRepository.findRoleForUser(clubId, ownerId)
    if (role === null) {
      throw new NotFoundException('Club not found')
    }
    if (role !== EMembershipRole.OWNER) {
      throw new ForbiddenException('Only the club owner can perform this action')
    }
  }

  private async createFreshInvite(
    clubId: string,
    createdByUserId: string,
  ): Promise<ClubInviteEntity> {
    return this.clubInviteRepository.insert({
      clubId,
      token: this.generateToken(),
      createdByUserId,
      expiresAt: this.buildExpiresAt(),
      revokedAt: null,
    })
  }

  private generateToken(): string {
    // D2: raw token stored in plaintext; ~256 bits of entropy.
    return crypto.randomBytes(32).toString('base64url')
  }

  private buildExpiresAt(): Date {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + this.inviteExpiryDays)
    return expiresAt
  }

  private toResult(entity: ClubInviteEntity): IClubInviteResult {
    return Object.freeze({
      token: entity.token,
      url: `${this.inviteUrl}/${entity.token}`,
      expiresAt: entity.expiresAt,
    })
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === '23505'
    )
  }
}
