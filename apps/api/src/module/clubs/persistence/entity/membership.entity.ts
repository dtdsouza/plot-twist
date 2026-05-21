import { Entity, Column, Index, Unique, ManyToOne, JoinColumn } from 'typeorm'
import { BaseEntity } from '@module/shared/persistence'
import { EMembershipRole } from '../enum/membership-role.enum'
import { ClubEntity } from './club.entity'

@Entity({ schema: 'clubs', name: 'membership' })
@Unique('UQ_membership_club_user', ['clubId', 'userId'])
@Index('IDX_membership_user', ['userId'])
export class MembershipEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  clubId!: string

  @ManyToOne(() => ClubEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club!: ClubEntity

  // userId references identity.user — cross-schema FKs are forbidden.
  // No @ManyToOne or FK constraint; integrity enforced at the application layer.
  @Column({ type: 'uuid' })
  userId!: string

  @Column({ type: 'enum', enum: EMembershipRole })
  role!: EMembershipRole

  @Column({ type: 'timestamptz' })
  joinedAt!: Date
}
