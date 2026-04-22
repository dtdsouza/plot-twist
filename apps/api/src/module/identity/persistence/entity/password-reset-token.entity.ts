import { Entity, Column } from 'typeorm'
import { BaseEntity } from '../../../../infra/typeorm'

@Entity({ schema: 'identity', name: 'password_reset_token' })
export class PasswordResetTokenEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string

  @Column({ type: 'uuid' })
  userId!: string

  @Column({ type: 'timestamp' })
  expiresAt!: Date
}
