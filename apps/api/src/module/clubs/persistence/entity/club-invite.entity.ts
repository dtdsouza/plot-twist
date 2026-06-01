import { Entity, Column, Index, Unique } from 'typeorm'
import { BaseEntity } from '@module/shared/persistence'

@Entity({ schema: 'clubs', name: 'club_invite' })
@Unique('UQ_club_invite_token', ['token'])
@Index('IDX_club_invite_club', ['clubId'])
export class ClubInviteEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  clubId!: string

  @Column({ type: 'varchar', length: 64 })
  token!: string

  // createdByUserId references identity.user — cross-schema FKs are forbidden.
  // No @ManyToOne or FK constraint; integrity enforced at the application layer.
  @Column({ type: 'uuid' })
  createdByUserId!: string

  @Column({ type: 'timestamptz', nullable: true, default: null })
  expiresAt!: Date | null

  @Column({ type: 'timestamptz', nullable: true, default: null })
  revokedAt!: Date | null
}
