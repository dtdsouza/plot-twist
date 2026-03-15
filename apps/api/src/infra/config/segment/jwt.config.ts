import { registerAs } from '@nestjs/config'
import type { StringValue } from 'ms'

export const JWT_CONFIG_KEY = 'jwt' as const

export interface IJwtConfig {
  readonly secret: string
  readonly expiresIn: StringValue
}

export const jwtConfig = registerAs(JWT_CONFIG_KEY, (): IJwtConfig => {
  return Object.freeze({
    secret: process.env.JWT_SECRET as string,
    expiresIn: process.env.JWT_EXPIRES_IN as StringValue,
  })
})
