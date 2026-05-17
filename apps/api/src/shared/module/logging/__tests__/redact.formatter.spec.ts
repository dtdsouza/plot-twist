import { format } from 'winston'
import { redact, REDACTED_KEYS, REDACTED_VALUE } from '../formatter/redact.formatter'

type TInfoObject = {
  level: string
  message: string
  [key: string]: unknown
}

function applyRedact(meta: TInfoObject): TInfoObject {
  const fmt = format.combine(redact())
  return fmt.transform(meta, {}) as TInfoObject
}

describe('redact formatter', () => {
  describe('REDACTED_KEYS constant', () => {
    it('includes the required sensitive keys (lowercase)', () => {
      const required = [
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
      for (const key of required) {
        expect(REDACTED_KEYS).toContain(key)
      }
    })
  })

  describe('top-level sensitive key', () => {
    it('replaces the value with REDACTED_VALUE', () => {
      // Arrange
      const info: TInfoObject = { level: 'info', message: 'login attempt', password: 'hunter2', username: 'alice' }

      // Act
      const result = applyRedact(info)

      // Assert
      expect(result.password).toBe(REDACTED_VALUE)
      expect(result.username).toBe('alice')
    })
  })

  describe('nested sensitive key', () => {
    it('redacts value inside a nested object', () => {
      // Arrange
      const info: TInfoObject = {
        level: 'info',
        message: 'request headers',
        headers: { authorization: 'Bearer abc123' },
      }

      // Act
      const result = applyRedact(info)

      // Assert
      const headers = result.headers as Record<string, unknown>
      expect(headers.authorization).toBe(REDACTED_VALUE)
    })
  })

  describe('case-insensitive match', () => {
    it('redacts keys regardless of case', () => {
      // Arrange
      const info: TInfoObject = {
        level: 'info',
        message: 'request',
        Authorization: 'Bearer xyz',
        TOKEN: 'secret',
      }

      // Act
      const result = applyRedact(info)

      // Assert
      expect(result.Authorization).toBe(REDACTED_VALUE)
      expect(result.TOKEN).toBe(REDACTED_VALUE)
    })
  })

  describe('email field', () => {
    it('does NOT redact email', () => {
      // Arrange
      const info: TInfoObject = {
        level: 'info',
        message: 'login',
        email: 'user@example.com',
        password: 'secret',
      }

      // Act
      const result = applyRedact(info)

      // Assert
      expect(result.email).toBe('user@example.com')
      expect(result.password).toBe(REDACTED_VALUE)
    })
  })

  describe('non-listed primitive key', () => {
    it('leaves the value unchanged', () => {
      // Arrange
      const info: TInfoObject = {
        level: 'info',
        message: 'event',
        userId: 'u_42',
        count: 7,
      }

      // Act
      const result = applyRedact(info)

      // Assert
      expect(result.userId).toBe('u_42')
      expect(result.count).toBe(7)
    })
  })

  describe('deep nested sensitive key', () => {
    it('redacts value deep inside nested objects', () => {
      // Arrange
      const info: TInfoObject = {
        level: 'info',
        message: 'payload',
        user: { profile: { security: { jwt: 'deep-secret' } } },
      }

      // Act
      const result = applyRedact(info)

      // Assert
      const user = result.user as { profile: { security: { jwt: string } } }
      expect(user.profile.security.jwt).toBe(REDACTED_VALUE)
    })
  })

  describe('array of objects', () => {
    it('redacts sensitive keys inside array elements', () => {
      // Arrange
      const info: TInfoObject = {
        level: 'info',
        message: 'users',
        list: [{ password: 'p1' }, { password: 'p2' }],
      }

      // Act
      const result = applyRedact(info)

      // Assert
      const list = result.list as Array<{ password: string }>
      expect(list[0].password).toBe(REDACTED_VALUE)
      expect(list[1].password).toBe(REDACTED_VALUE)
    })
  })

  describe('prototype pollution safety', () => {
    it('skips __proto__ keys without throwing or mutating Object.prototype', () => {
      // Arrange — snapshot Object.prototype before the call
      const before = Object.getPrototypeOf({})
      const info: TInfoObject = {
        level: 'info',
        message: 'payload with prototype key',
      }
      // Inject __proto__ key via Object.defineProperty to avoid TypeScript complaints
      Object.defineProperty(info, '__proto__', { value: { injected: true }, enumerable: true, configurable: true })

      // Act — must not throw
      expect(() => applyRedact(info)).not.toThrow()

      // Assert — Object.prototype is unchanged
      expect(Object.getPrototypeOf({})).toBe(before)
      expect(({} as Record<string, unknown>)['injected']).toBeUndefined()
    })

    it('skips constructor keys', () => {
      // Arrange
      const info: TInfoObject = { level: 'info', message: 'test' } as TInfoObject
      ;(info as Record<string, unknown>)['constructor'] = 'malicious'

      // Act
      const result = applyRedact(info)

      // Assert — constructor key is dropped from the output
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false)
    })
  })

  describe('circular reference safety', () => {
    it('replaces a circular reference with "[Circular]" without throwing', () => {
      // Arrange
      const circular: Record<string, unknown> = { level: 'info', message: 'circular test' }
      circular['self'] = circular // intentional cycle

      // Act — must not throw
      let result: TInfoObject | undefined
      expect(() => {
        result = applyRedact(circular as TInfoObject)
      }).not.toThrow()

      // Assert — circular node replaced with a safe placeholder
      expect((result as Record<string, unknown>)['self']).toBe('[Circular]')
    })

    it('handles indirect circular references', () => {
      // Arrange
      const a: Record<string, unknown> = { level: 'info', message: 'test' }
      const b: Record<string, unknown> = {}
      a['child'] = b
      b['parent'] = a // cycle: a -> b -> a

      // Act
      let result: TInfoObject | undefined
      expect(() => {
        result = applyRedact(a as TInfoObject)
      }).not.toThrow()

      // Assert — both entries produced without crash
      expect(result).toBeDefined()
      const child = (result as Record<string, unknown>)['child'] as Record<string, unknown>
      expect(child['parent']).toBe('[Circular]')
    })
  })
})
