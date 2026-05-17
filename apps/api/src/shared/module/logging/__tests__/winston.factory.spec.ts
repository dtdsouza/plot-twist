import { createWinstonOptions } from '../factory/winston.factory'
import { jsonFormatter } from '../formatter/json.formatter'
import { prettyFormatter } from '../formatter/pretty.formatter'

describe('winston factory', () => {
  describe('createWinstonOptions return value', () => {
    it('returns an object with the configured level', () => {
      // Arrange & Act
      const options = createWinstonOptions({ level: 'debug', format: 'json' })

      // Assert
      expect(options.level).toBe('debug')
    })

    it('returns an object with a Console transport', () => {
      // Arrange & Act
      const options = createWinstonOptions({ level: 'info', format: 'json' })
      const transports = options.transports as unknown[]

      // Assert
      expect(Array.isArray(transports)).toBe(true)
      expect(transports.length).toBeGreaterThan(0)
    })

    it('returns the json formatter when format is "json"', () => {
      // Arrange & Act
      const options = createWinstonOptions({ level: 'info', format: 'json' })

      // Assert — verify the format object is the same reference as jsonFormatter
      expect(options.format).toBe(jsonFormatter)
    })

    it('returns the pretty formatter when format is "pretty"', () => {
      // Arrange & Act
      const options = createWinstonOptions({ level: 'info', format: 'pretty' })

      // Assert — verify the format object is the same reference as prettyFormatter
      expect(options.format).toBe(prettyFormatter)
    })
  })

  describe('format selection — json', () => {
    it('json formatter produces parseable JSON output', () => {
      // Arrange
      const options = createWinstonOptions({ level: 'info', format: 'json' })
      const fmt = options.format as { transform: (i: object, o: object) => object }
      const info = { level: 'info', message: 'json test', context: 'Test' }

      // Act
      const result = fmt.transform(Object.assign({}, info), {})
      const syms = Object.getOwnPropertySymbols(result)
      const msgSym = syms.find((s) => s.toString() === 'Symbol(message)')!
      const raw = (result as Record<symbol, string>)[msgSym]

      // Assert
      expect(() => JSON.parse(raw)).not.toThrow()
      const parsed = JSON.parse(raw)
      expect(parsed).toHaveProperty('message', 'json test')
    })
  })

  describe('format selection — pretty', () => {
    it('pretty formatter produces a different format object than json formatter', () => {
      // Arrange
      const jsonOptions = createWinstonOptions({ level: 'info', format: 'json' })
      const prettyOptions = createWinstonOptions({ level: 'info', format: 'pretty' })

      // Assert — they must be different formatter instances
      expect(jsonOptions.format).not.toBe(prettyOptions.format)
    })
  })
})
