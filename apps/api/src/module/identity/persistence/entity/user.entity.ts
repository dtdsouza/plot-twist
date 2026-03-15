import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { EUserStatus } from "../enum/user-status.enum";

@Entity({ schema: "identity", name: "user" })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255, unique: true })
  email!: string;

  @Column({ type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ type: "varchar", length: 100 })
  displayName!: string;

  @Column({ type: "varchar", length: 500, nullable: true, default: null })
  avatar!: string | null;

  @Column({ type: "text", nullable: true, default: null })
  bio!: string | null;

  @Column({
    type: "enum",
    enum: EUserStatus,
    default: EUserStatus.ACTIVE,
  })
  status!: EUserStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
