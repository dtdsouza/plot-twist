import { registerAs } from '@nestjs/config'

export const LOGGING_CONFIG_KEY = 'logging' as const

export interface ILoggingConfig {
  readonly level: 'error' | 'warn' | 'info' | 'debug' | 'verbose'
  readonly format: 'json' | 'pretty'
}

const VALID_LEVELS: ReadonlyArray<ILoggingConfig['level']> = ['error', 'warn', 'info', 'debug', 'verbose']
const VALID_FORMATS: ReadonlyArray<ILoggingConfig['format']> = ['json', 'pretty']

export function resolveLoggingConfig(env: Record<string, string | undefined>): ILoggingConfig {
  const rawLevel = env['LOG_LEVEL']
  const level: ILoggingConfig['level'] = VALID_LEVELS.includes(rawLevel as ILoggingConfig['level'])
    ? (rawLevel as ILoggingConfig['level'])
    : 'info'

  const rawFormat = env['LOG_FORMAT']
  const format: ILoggingConfig['format'] = VALID_FORMATS.includes(rawFormat as ILoggingConfig['format'])
    ? (rawFormat as ILoggingConfig['format'])
    : env['NODE_ENV'] === 'development'
    ? 'pretty'
    : 'json'

  return Object.freeze({ level, format })
}

export const loggingConfig = registerAs(LOGGING_CONFIG_KEY, () => resolveLoggingConfig(process.env))
