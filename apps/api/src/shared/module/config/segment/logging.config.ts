import { registerAs } from '@nestjs/config'

export const LOGGING_CONFIG_KEY = 'logging' as const

export interface ILoggingConfig {
  readonly level: 'error' | 'warn' | 'info' | 'debug' | 'verbose'
  readonly format: 'json' | 'pretty'
}

export const loggingConfig = registerAs(LOGGING_CONFIG_KEY, (): ILoggingConfig => {
  const level = (process.env.LOG_LEVEL ?? 'info') as ILoggingConfig['level']
  const rawFormat = process.env.LOG_FORMAT as 'json' | 'pretty' | undefined
  const format: ILoggingConfig['format'] =
    rawFormat ?? (process.env.NODE_ENV === 'development' ? 'pretty' : 'json')

  return Object.freeze({ level, format })
})
