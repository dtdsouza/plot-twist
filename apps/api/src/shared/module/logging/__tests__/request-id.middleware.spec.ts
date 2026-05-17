import { RequestIdMiddleware } from '../middleware/request-id.middleware'

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function buildMockLogger() {
  const childLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    child: jest.fn(),
  }
  childLogger.child.mockReturnValue(childLogger)

  const rootLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    child: jest.fn().mockReturnValue(childLogger),
  }

  return { rootLogger, childLogger }
}

function buildMockRequest(headers: Record<string, string> = {}) {
  return {
    headers,
    requestId: undefined as string | undefined,
    log: undefined as unknown,
  }
}

function buildMockResponse() {
  const headers: Record<string, string> = {}
  return {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value
    }),
    _headers: headers,
  }
}

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware
  let mockLogger: ReturnType<typeof buildMockLogger>

  beforeEach(() => {
    mockLogger = buildMockLogger()
    middleware = new RequestIdMiddleware(mockLogger.rootLogger as never)
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('when x-request-id header is present', () => {
    it('honors the inbound request id', () => {
      // Arrange
      const req = buildMockRequest({ 'x-request-id': 'abc-123' })
      const res = buildMockResponse()
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)

      // Assert
      expect(req.requestId).toBe('abc-123')
    })

    it('echoes the inbound id on the response header', () => {
      // Arrange
      const req = buildMockRequest({ 'x-request-id': 'abc-123' })
      const res = buildMockResponse()
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123')
    })
  })

  describe('when x-request-id header is absent', () => {
    it('generates a UUIDv4 request id', () => {
      // Arrange
      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)

      // Assert
      expect(req.requestId).toMatch(UUID_V4_REGEX)
    })

    it('sets the generated id on the response header', () => {
      // Arrange
      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', expect.stringMatching(UUID_V4_REGEX))
    })
  })

  describe('child logger', () => {
    it('attaches a child logger carrying requestId to req.log', () => {
      // Arrange
      const req = buildMockRequest({ 'x-request-id': 'test-id' })
      const res = buildMockResponse()
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)

      // Assert
      expect(mockLogger.rootLogger.child).toHaveBeenCalledWith({ requestId: 'test-id' })
      expect(req.log).toBe(mockLogger.childLogger)
    })
  })

  describe('next()', () => {
    it('calls next to pass control to the next middleware', () => {
      // Arrange
      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = jest.fn()

      // Act
      middleware.use(req as never, res as never, next)

      // Assert
      expect(next).toHaveBeenCalledTimes(1)
    })
  })
})
