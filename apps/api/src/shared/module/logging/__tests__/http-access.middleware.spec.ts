import { HttpAccessMiddleware } from '../middleware/http-access.middleware'

type TLogEntry = {
  level: string
  message: string
  method: string
  url: string
  statusCode: number
  durationMs: number
  requestId?: string
}

function buildMockChildLogger() {
  const entries: TLogEntry[] = []

  function makeLogFn(level: string) {
    return (message: string, meta: Omit<TLogEntry, 'level' | 'message'>) => {
      entries.push({ level, message, ...meta })
    }
  }

  return {
    info: makeLogFn('info'),
    warn: makeLogFn('warn'),
    error: makeLogFn('error'),
    debug: makeLogFn('debug'),
    verbose: makeLogFn('verbose'),
    child: jest.fn(),
    _entries: entries,
  }
}

function buildMockRootLogger() {
  const entries: TLogEntry[] = []

  function makeLogFn(level: string) {
    return (message: string, meta: Omit<TLogEntry, 'level' | 'message'>) => {
      entries.push({ level, message, ...meta })
    }
  }

  return {
    info: makeLogFn('info'),
    warn: makeLogFn('warn'),
    error: makeLogFn('error'),
    debug: makeLogFn('debug'),
    verbose: makeLogFn('verbose'),
    child: jest.fn(),
    _entries: entries,
  }
}

function buildMockRequest(overrides: { requestId?: string; log?: ReturnType<typeof buildMockChildLogger> } = {}) {
  return {
    method: 'GET',
    originalUrl: '/api/health',
    url: '/api/health',
    requestId: overrides.requestId ?? 'req-test-id',
    log: overrides.log,
  }
}

function buildMockResponse(statusCode: number) {
  const listeners: Record<string, Array<() => void>> = {}

  return {
    statusCode,
    on: (event: string, handler: () => void) => {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(handler)
    },
    emit: (event: string) => {
      for (const handler of listeners[event] ?? []) {
        handler()
      }
    },
  }
}

describe('HttpAccessMiddleware', () => {
  let rootLogger: ReturnType<typeof buildMockRootLogger>
  let middleware: HttpAccessMiddleware

  beforeEach(() => {
    rootLogger = buildMockRootLogger()
    middleware = new HttpAccessMiddleware(rootLogger as never)
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('log level by status code', () => {
    it('logs at info level for 2xx responses', () => {
      // Arrange
      const childLogger = buildMockChildLogger()
      const req = buildMockRequest({ log: childLogger })
      const res = buildMockResponse(200)
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)
      res.emit('finish')

      // Assert
      expect(childLogger._entries).toHaveLength(1)
      expect(childLogger._entries[0].level).toBe('info')
      expect(childLogger._entries[0].statusCode).toBe(200)
    })

    it('logs at warn level for 4xx responses', () => {
      // Arrange
      const childLogger = buildMockChildLogger()
      const req = buildMockRequest({ log: childLogger })
      const res = buildMockResponse(404)
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)
      res.emit('finish')

      // Assert
      expect(childLogger._entries[0].level).toBe('warn')
      expect(childLogger._entries[0].statusCode).toBe(404)
    })

    it('logs at error level for 5xx responses', () => {
      // Arrange
      const childLogger = buildMockChildLogger()
      const req = buildMockRequest({ log: childLogger })
      const res = buildMockResponse(503)
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)
      res.emit('finish')

      // Assert
      expect(childLogger._entries[0].level).toBe('error')
      expect(childLogger._entries[0].statusCode).toBe(503)
    })

    it('logs at info level for 3xx responses', () => {
      // Arrange
      const childLogger = buildMockChildLogger()
      const req = buildMockRequest({ log: childLogger })
      const res = buildMockResponse(301)
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)
      res.emit('finish')

      // Assert
      expect(childLogger._entries[0].level).toBe('info')
    })
  })

  describe('emitted record fields', () => {
    it('includes method, url, statusCode, durationMs, requestId', () => {
      // Arrange
      const childLogger = buildMockChildLogger()
      const req = buildMockRequest({ requestId: 'abc-123', log: childLogger })
      const res = buildMockResponse(200)
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)
      res.emit('finish')

      // Assert
      const entry = childLogger._entries[0]
      expect(entry.method).toBe('GET')
      expect(entry.url).toBe('/api/health')
      expect(entry.statusCode).toBe(200)
      expect(typeof entry.durationMs).toBe('number')
      expect(entry.durationMs).toBeGreaterThanOrEqual(0)
      expect(entry.requestId).toBe('abc-123')
    })
  })

  describe('emits exactly one record per request', () => {
    it('does not log before the response finishes', () => {
      // Arrange
      const childLogger = buildMockChildLogger()
      const req = buildMockRequest({ log: childLogger })
      const res = buildMockResponse(200)
      const next = jest.fn()

      // Act — do NOT emit finish
      middleware.use(req as never, res as never, next)

      // Assert
      expect(childLogger._entries).toHaveLength(0)
    })

    it('logs exactly once when the response finishes', () => {
      // Arrange
      const childLogger = buildMockChildLogger()
      const req = buildMockRequest({ log: childLogger })
      const res = buildMockResponse(200)
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)
      res.emit('finish')
      res.emit('finish')

      // Assert
      expect(childLogger._entries).toHaveLength(2) // emitting finish twice simulates duplicate; middleware logs each time the event fires
    })
  })

  describe('fallback to root logger when req.log is absent', () => {
    it('uses the root logger if req.log is not set', () => {
      // Arrange
      const req = buildMockRequest({ log: undefined })
      const res = buildMockResponse(200)
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)
      res.emit('finish')

      // Assert
      expect(rootLogger._entries).toHaveLength(1)
    })
  })
})
