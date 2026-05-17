import { format, type Logform } from 'winston'
import { redact } from './redact.formatter'

export const jsonFormatter: Logform.Format = format.combine(
  format.timestamp({ format: () => new Date().toISOString() }),
  redact(),
  format.json(),
)
