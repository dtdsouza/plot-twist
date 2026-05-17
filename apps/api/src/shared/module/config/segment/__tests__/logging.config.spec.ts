import { resolveLoggingConfig } from '../logging.config'

describe('resolveLoggingConfig', () => {
  describe('level resolution', () => {
    it('defaults to "info" when LOG_LEVEL is absent', () => {
      const config = resolveLoggingConfig({})
      expect(config.level).toBe('info')
    })

    it('uses LOG_LEVEL when it is a valid value', () => {
      const config = resolveLoggingConfig({ LOG_LEVEL: 'debug' })
      expect(config.level).toBe('debug')
    })

    it('defaults to "info" when LOG_LEVEL is an unrecognised value', () => {
      const config = resolveLoggingConfig({ LOG_LEVEL: 'verbose_extra' })
      expect(config.level).toBe('info')
    })
  })

  describe('format resolution', () => {
    it('defaults to "pretty" in development when LOG_FORMAT is absent', () => {
      const config = resolveLoggingConfig({ NODE_ENV: 'development' })
      expect(config.format).toBe('pretty')
    })

    it('defaults to "json" in production when LOG_FORMAT is absent', () => {
      const config = resolveLoggingConfig({ NODE_ENV: 'production' })
      expect(config.format).toBe('json')
    })

    it('uses LOG_FORMAT when it is a valid value', () => {
      const config = resolveLoggingConfig({ LOG_FORMAT: 'json', NODE_ENV: 'development' })
      expect(config.format).toBe('json')
    })

    it('falls back to NODE_ENV-based default when LOG_FORMAT is unrecognised', () => {
      const config = resolveLoggingConfig({ LOG_FORMAT: 'text', NODE_ENV: 'production' })
      expect(config.format).toBe('json')
    })
  })
})
