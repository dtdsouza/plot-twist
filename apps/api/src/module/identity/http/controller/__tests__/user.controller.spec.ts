import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { UserController } from '../user.controller'
import { UserService } from '../../../core/user.service'
import { JwtAuthGuard } from '../../guard/jwt-auth.guard'
import { IUserResponse } from '../../dto/auth-response.interface'
import { IJwtPayload } from '../../dto/jwt-payload.interface'

describe('UserController', () => {
  let controller: UserController
  let mockUserService: { findById: jest.Mock }

  const mockUserResponse: IUserResponse = {
    id: 'uuid-123',
    email: 'test@example.com',
    displayName: 'Test User',
    avatar: null,
    bio: null,
    createdAt: new Date('2024-01-01'),
  }

  const mockCurrentUser: IJwtPayload = {
    sub: 'uuid-123',
    email: 'test@example.com',
  }

  beforeEach(async () => {
    mockUserService = {
      findById: jest.fn().mockResolvedValue(mockUserResponse),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<UserController>(UserController)
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('getMe', () => {
    it('looks up the user by the JWT subject and returns the response', async () => {
      // Act
      const result = await controller.getMe(mockCurrentUser)

      // Assert
      expect(mockUserService.findById).toHaveBeenCalledWith(mockCurrentUser.sub)
      expect(result).toEqual(mockUserResponse)
    })
  })

  describe('getById', () => {
    it('looks up the user by the path id and returns the response', async () => {
      // Act
      const result = await controller.getById('uuid-456')

      // Assert
      expect(mockUserService.findById).toHaveBeenCalledWith('uuid-456')
      expect(result).toEqual(mockUserResponse)
    })

    it('propagates NotFoundException from the service', async () => {
      // Arrange
      mockUserService.findById.mockRejectedValue(
        new NotFoundException('User not found'),
      )

      // Act & Assert
      await expect(controller.getById('missing-id')).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})
