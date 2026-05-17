import { jsonFormatter } from '../formatter/json.formatter'

const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

type TInfoObject = {
  level: string
  message: string
  [key: string]: unknown
}

function getFormattedMessage(info: TInfoObject): string {
  const result = jsonFormatter.transform(Object.assign({}, info), {}) as TInfoObject
  const syms = Object.getOwnPropertySymbols(result)
  const msgSym = syms.find((s) => s.toString() === 'Symbol(message)')!
  return (result as unknown as Record<symbol, string>)[msgSym]
}

function applyJsonFormatter(info: TInfoObject): Record<string, unknown> {
  return JSON.parse(getFormattedMessage(info))
}

describe('json formatter', () => {
  describe('output shape', () => {
    it('produces valid JSON output', () => {
      // Arrange
      const info: TInfoObject = { level: 'info', message: 'test message', context: 'TestSuite' }

      // Act & Assert
      expect(() => applyJsonFormatter(info)).not.toThrow()
    })

    it('includes required fields: timestamp, level, message, context', () => {
      // Arrange
      const info: TInfoObject = { level: 'info', message: 'user registered', context: 'IdentityService' }

      // Act
      const parsed = applyJsonFormatter(info)

      // Assert
      expect(parsed).toHaveProperty('timestamp')
      expect(parsed).toHaveProperty('level', 'info')
      expect(parsed).toHaveProperty('message', 'user registered')
      expect(parsed).toHaveProperty('context', 'IdentityService')
    })

    it('timestamp matches ISO-8601 format with timezone offset', () => {
      // Arrange
      const info: TInfoObject = { level: 'warn', message: 'check timestamp', context: 'Test' }

      // Act
      const parsed = applyJsonFormatter(info)

      // Assert
      expect(parsed.timestamp).toMatch(ISO_TIMESTAMP_REGEX)
    })
  })

  describe('metadata passthrough', () => {
    it('includes additional structured metadata at the top level', () => {
      // Arrange
      const info: TInfoObject = {
        level: 'info',
        message: 'user registered',
        context: 'AuthService',
        userId: 'u_1',
        role: 'admin',
      }

      // Act
      const parsed = applyJsonFormatter(info)

      // Assert
      expect(parsed.userId).toBe('u_1')
      expect(parsed.role).toBe('admin')
    })
  })

  describe('redaction integration', () => {
    it('redacts sensitive fields before JSON serialization', () => {
      // Arrange
      const info: TInfoObject = {
        level: 'info',
        message: 'login',
        context: 'Auth',
        email: 'user@test.com',
        password: 's3cret',
      }

      // Act
      const parsed = applyJsonFormatter(info)

      // Assert
      expect(parsed.password).toBe('[REDACTED]')
      expect(parsed.email).toBe('user@test.com')
    })
  })
})
