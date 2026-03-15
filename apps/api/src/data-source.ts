import "reflect-metadata";
import { DataSource } from "typeorm";
import { envSchema } from "./infra/config/env.schema";
import { UserEntity } from "./module/identity/persistence/entity/user.entity";

const env = envSchema.parse(process.env);

export const AppDataSource = new DataSource({
  type: "postgres",
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  synchronize: env.DB_SYNCHRONIZE,
  logging: env.DB_LOGGING,
  entities: [UserEntity],
  migrations: ["src/module/identity/migrations/*.ts"],
  subscribers: [],
});
