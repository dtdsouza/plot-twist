import { createLogger, transports, type LoggerOptions } from 'winston'
import { jsonFormatter } from '../formatter/json.formatter'
import { prettyFormatter } from '../formatter/pretty.formatter'

export interface IWinstonFactoryOptions {
  readonly level: string
  readonly format: 'json' | 'pretty'
}

export function createWinstonOptions(options: IWinstonFactoryOptions): LoggerOptions {
  const logFormat = options.format === 'json' ? jsonFormatter : prettyFormatter

  return {
    level: options.level,
    format: logFormat,
    transports: [new transports.Console()],
  }
}

export function createWinstonLogger(options: IWinstonFactoryOptions) {
  return createLogger(createWinstonOptions(options))
}
