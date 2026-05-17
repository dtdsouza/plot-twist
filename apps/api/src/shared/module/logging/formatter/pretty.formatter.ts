import { format, type Logform } from 'winston'
import { redact } from './redact.formatter'

export const prettyFormatter: Logform.Format = format.combine(
  format.colorize(),
  format.timestamp(),
  redact(),
  format.printf(({ timestamp, level, message, context, ...meta }) => {
    const contextPart = context ? ` [${String(context)}]` : ''
    const metaKeys = Object.keys(meta).filter((k) => k !== 'splat')
    const metaPart =
      metaKeys.length > 0 ? ` ${JSON.stringify(Object.fromEntries(metaKeys.map((k) => [k, meta[k]])))}` : ''
    return `${String(timestamp)} ${level}${contextPart}: ${String(message)}${metaPart}`
  }),
)
