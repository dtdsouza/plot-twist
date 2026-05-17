import { Module, type DynamicModule } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { envSchema } from "./env.schema";
import {
  appConfig,
  databaseConfig,
  jwtConfig,
  loggingConfig,
  mailConfig,
  storageConfig,
} from "./segment";

@Module({})
export class ConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          validate: (config: Record<string, unknown>) => {
            const result = envSchema.safeParse(config);

            if (!result.success) {
              const formatted = result.error.issues
                .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
                .join("\n");
              throw new Error(`Environment validation failed:\n${formatted}`);
            }

            return result.data;
          },
          load: [appConfig, databaseConfig, jwtConfig, loggingConfig, mailConfig, storageConfig],
        }),
      ],
    };
  }
}
