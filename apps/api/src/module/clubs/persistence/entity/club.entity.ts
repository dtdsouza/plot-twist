import { Entity, Column, Index } from 'typeorm'
import { BaseEntity } from '@module/shared/persistence'

@Entity({ schema: 'clubs', name: 'club' })
export class ClubEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'text', nullable: true, default: null })
  description!: string | null

  @Index()
  @Column({ type: 'uuid' })
  ownerId!: string

  @Column({ type: 'text', nullable: true, default: null })
  coverImageUrl!: string | null
}
