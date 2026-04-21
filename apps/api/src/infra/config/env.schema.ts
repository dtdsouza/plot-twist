import { z } from 'zod'

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((val) => val === 'true')

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(3333),

  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USERNAME: z.string().min(1).default('postgres'),
  DB_PASSWORD: z.string().min(1).default('postgres'),
  DB_NAME: z.string().min(1).default('plot-twist'),
  DB_SYNCHRONIZE: booleanFromString,
  DB_LOGGING: booleanFromString,

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),

  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_ADDRESS: z.string().min(1).default('Plot-Twist <onboarding@resend.dev>'),
  PASSWORD_RESET_URL: z.string().url().default('http://localhost:4200/reset-password'),
})
