import { format, type Logform } from 'winston'

export const REDACTED_KEYS: ReadonlyArray<string> = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'authorization',
  'cookie',
  'set-cookie',
]

export const REDACTED_VALUE = '[REDACTED]'

function redactObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_KEYS.includes(key.toLowerCase())) {
      result[key] = REDACTED_VALUE
    } else {
      result[key] = redactObject(value)
    }
  }
  return result
}

export const redact: Logform.FormatWrap = format((info) => {
  const { message, level, ...meta } = info

  const redacted = redactObject(meta) as Record<string, unknown>

  return Object.assign(redacted, { message, level })
})
