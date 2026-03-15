import { z } from 'zod'
import { envSchema } from './env.schema'

export type TEnv = z.infer<typeof envSchema>
