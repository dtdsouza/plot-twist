import { Entity, Column } from "typeorm";
import { EUserStatus } from "../enum/user-status.enum";
import { BaseEntity } from "../../../../infra/typeorm";

@Entity({ schema: "identity", name: "user" })
export class UserEntity extends BaseEntity {
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
}
