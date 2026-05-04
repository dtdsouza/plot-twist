import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { JwtAuthGuard } from '../jwt-auth.guard'

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard
  let mockJwtService: { verifyAsync: jest.Mock }

  const buildContext = (authorization?: string): ExecutionContext => {
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: authorization ? { authorization } : {},
    }
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext
  }

  beforeEach(() => {
    mockJwtService = { verifyAsync: jest.fn() }
    guard = new JwtAuthGuard(mockJwtService as unknown as JwtService)
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  it('returns true and attaches the payload to request.user when the token is valid', async () => {
    // Arrange
    const payload = { sub: 'user-id-123', email: 'user@example.com' }
    mockJwtService.verifyAsync.mockResolvedValue(payload)
    const ctx = buildContext('Bearer valid-token')
    const request = ctx.switchToHttp().getRequest()

    // Act
    const result = await guard.canActivate(ctx)

    // Assert
    expect(result).toBe(true)
    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('valid-token')
    expect(request.user).toEqual(payload)
  })

  it('throws UnauthorizedException when authorization header is missing', async () => {
    const ctx = buildContext(undefined)

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    expect(mockJwtService.verifyAsync).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedException when scheme is not Bearer', async () => {
    const ctx = buildContext('Basic some-token')

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    expect(mockJwtService.verifyAsync).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedException when Bearer token value is empty', async () => {
    const ctx = buildContext('Bearer ')

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    expect(mockJwtService.verifyAsync).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedException when verifyAsync rejects', async () => {
    mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'))
    const ctx = buildContext('Bearer bad-token')

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('bad-token')
  })
})
