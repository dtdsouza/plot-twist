import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { AuthController } from '../auth.controller'
import { AuthService } from '../../../core/auth.service'
import { IAuthResponse } from '../../dto/auth-response.interface'

describe('AuthController', () => {
  let controller: AuthController
  let mockAuthService: {
    register: jest.Mock
    login: jest.Mock
    forgotPassword: jest.Mock
    resetPassword: jest.Mock
  }

  const mockAuthResponse: IAuthResponse = {
    accessToken: 'mock-token',
    user: {
      id: 'uuid-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatar: null,
      bio: null,
      createdAt: new Date('2024-01-01'),
    },
  }

  beforeEach(async () => {
    mockAuthService = {
      register: jest.fn().mockResolvedValue(mockAuthResponse),
      login: jest.fn().mockResolvedValue(mockAuthResponse),
      forgotPassword: jest.fn().mockResolvedValue(undefined),
      resetPassword: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile()

    controller = module.get<AuthController>(AuthController)
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('register', () => {
    it('should call authService.register and return the result', async () => {
      // Arrange
      const dto = {
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
      }

      // Act
      const result = await controller.register(dto as any)

      // Assert
      expect(mockAuthService.register).toHaveBeenCalledWith(dto)
      expect(result).toEqual(mockAuthResponse)
    })
  })

  describe('login', () => {
    it('should call authService.login and return the result', async () => {
      // Arrange
      const dto = {
        email: 'test@example.com',
        password: 'password123',
      }

      // Act
      const result = await controller.login(dto as any)

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(dto)
      expect(result).toEqual(mockAuthResponse)
    })
  })

  describe('forgotPassword', () => {
    it('should delegate to authService and return generic message', async () => {
      // Arrange
      const dto = { email: 'test@example.com' }

      // Act
      const result = await controller.forgotPassword(dto as any)

      // Assert
      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto.email)
      expect(result).toEqual({
        message:
          'If an account with that email exists, we have sent a password reset link.',
      })
    })
  })

  describe('resetPassword', () => {
    it('should delegate to authService and return success message', async () => {
      // Arrange
      const dto = { token: 'raw-token', password: 'newPassword123' }

      // Act
      const result = await controller.resetPassword(dto as any)

      // Assert
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
        dto.token,
        dto.password,
      )
      expect(result).toEqual({
        message:
          'Password has been reset successfully. Please log in with your new password.',
      })
    })

    it('should propagate BadRequestException from service', async () => {
      // Arrange
      const dto = { token: 'invalid-token', password: 'newPassword123' }
      mockAuthService.resetPassword.mockRejectedValue(
        new BadRequestException('Invalid or expired reset token'),
      )

      // Act & Assert
      await expect(controller.resetPassword(dto as any)).rejects.toThrow(
        BadRequestException,
      )
    })
  })
})
