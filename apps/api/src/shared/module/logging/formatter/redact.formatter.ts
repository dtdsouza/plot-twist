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
  'secret',
  'clientsecret',
  'apikey',
  'api_key',
  'privatekey',
]

export const REDACTED_VALUE = '[REDACTED]'

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function redactObject(obj: unknown, seen = new WeakSet()): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (seen.has(obj as object)) {
    return '[Circular]'
  }
  seen.add(obj as object)

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (UNSAFE_KEYS.has(key)) continue
    if (REDACTED_KEYS.includes(key.toLowerCase())) {
      result[key] = REDACTED_VALUE
    } else {
      result[key] = redactObject(value, seen)
    }
  }
  return result
}

export const redact: Logform.FormatWrap = format((info) => {
  const { message, level, ...meta } = info

  // Pre-seed `info` itself so that if any meta value back-references the
  // original info object (e.g. `req.log.info('msg', { req })`), the walker
  // detects the cycle rather than recursing infinitely.
  const seen = new WeakSet([info as object])
  const redacted = redactObject(meta, seen) as Record<string, unknown>

  return Object.assign(redacted, { message, level })
})
