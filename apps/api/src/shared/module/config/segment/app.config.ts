import { registerAs } from '@nestjs/config'

export const APP_CONFIG_KEY = 'app' as const

export interface IAppConfig {
  readonly port: number
  readonly nodeEnv: string
  readonly isProduction: boolean
}

export const appConfig = registerAs(APP_CONFIG_KEY, (): IAppConfig => {
  const nodeEnv = process.env.NODE_ENV as string

  return Object.freeze({
    port: Number(process.env.PORT),
    nodeEnv,
    isProduction: nodeEnv === 'production',
  })
})
