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
  EMAIL_CHANGE_VERIFICATION_URL: z
    .string()
    .url()
    .default('http://localhost:4200/verify-email-change'),

  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ENDPOINT: z.string().optional().default(''),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_AVATARS: z.string().min(1).default('plot-twist-avatars'),
  S3_PUBLIC_URL_BASE: z.string().optional().default(''),
  MAX_AVATAR_SIZE_BYTES: z.coerce.number().int().positive().default(2_097_152),
  MAX_AVATAR_DIMENSION: z.coerce.number().int().positive().default(2048),
  AVATAR_ALLOWED_MIME: z
    .string()
    .min(1)
    .default('image/jpeg,image/png,image/webp'),
  PRESIGNED_POST_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug', 'verbose'])
    .default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
})
