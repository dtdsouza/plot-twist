import { Test, TestingModule } from '@nestjs/testing'
import { AuthController } from '../auth.controller'
import { AuthService } from '../../../core/auth.service'
import { EUserStatus } from '../../../persistence/enum/user-status.enum'
import { IAuthResponse } from '../../dto/auth-response.interface'

describe('AuthController', () => {
  let controller: AuthController
  let mockAuthService: {
    register: jest.Mock
    login: jest.Mock
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
})
