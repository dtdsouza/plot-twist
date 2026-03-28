import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity({ schema: "identity", name: "password_reset_token" })
export class PasswordResetTokenEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  tokenHash!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "timestamp" })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
