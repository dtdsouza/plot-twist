import { format, type Logform } from 'winston'
import { redact } from './redact.formatter'

export const jsonFormatter: Logform.Format = format.combine(
  format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  redact(),
  format.json(),
)
