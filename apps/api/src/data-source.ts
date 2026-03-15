import "reflect-metadata";
import { DataSource } from "typeorm";
import { UserEntity } from "./module/identity/persistence/entity/user.entity";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  username: process.env.DB_USERNAME ?? "postgres",
  password: process.env.DB_PASSWORD ?? "postgres",
  database: process.env.DB_NAME ?? "plot-twist",
  synchronize: process.env.DB_SYNCHRONIZE === "true",
  logging: process.env.DB_LOGGING === "true",
  entities: [UserEntity],
  migrations: ["src/identity/migrations/*.ts"],
  subscribers: [],
});
