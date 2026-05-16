import { Entity, Column, Index } from 'typeorm'
import { BaseEntity } from '@module/shared/persistence'

@Entity({ schema: 'identity', name: 'email_change_token' })
export class EmailChangeTokenEntity extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId!: string

  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string

  @Column({ type: 'varchar', length: 255 })
  newEmail!: string

  @Column({ type: 'timestamp' })
  expiresAt!: Date
}
