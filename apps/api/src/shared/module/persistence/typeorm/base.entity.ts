import {
  PrimaryColumn,
  BeforeInsert,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { randomUUID } from "node:crypto";

export abstract class BaseEntity {
  // `default: gen_random_uuid()` is the DB-side safety net per ADR 0005.
  // App-side generation via the @BeforeInsert hook remains the primary path.
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  readonly updatedAt!: Date;

  // TypeORM lifecycle hooks must mutate `this`; this is the framework-level
  // exception to the project-wide immutability rule.
  @BeforeInsert()
  protected assignIdentityFields(): void {
    if (!this.id) {
      this.id = randomUUID();
    }
    if (!this.createdAt) {
      this.createdAt = new Date();
    }
  }
}
