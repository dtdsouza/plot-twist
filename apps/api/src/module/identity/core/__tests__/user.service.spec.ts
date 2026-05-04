import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { UserService } from '../user.service'
import { UserRepository } from '../../persistence/repository/user.repository'
import { UserEntity } from '../../persistence/entity/user.entity'
import { EUserStatus } from '../../persistence/enum/user-status.enum'

describe('UserService', () => {
  let service: UserService
  let mockUserRepository: { findOne: jest.Mock }

  const mockUser: UserEntity = {
    id: 'uuid-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    displayName: 'Test User',
    avatar: null,
    bio: null,
    status: EUserStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  beforeEach(async () => {
    mockUserRepository = { findOne: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: mockUserRepository },
      ],
    }).compile()

    service = module.get<UserService>(UserService)
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('findById', () => {
    it('returns the mapped user response when the user exists', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)

      // Act
      const result = await service.findById(mockUser.id)

      // Assert
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ id: mockUser.id })
      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        displayName: mockUser.displayName,
        avatar: mockUser.avatar,
        bio: mockUser.bio,
        createdAt: mockUser.createdAt,
      })
    })

    it('never includes passwordHash in the response', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)

      // Act
      const result = await service.findById(mockUser.id)

      // Assert
      expect(result).not.toHaveProperty('passwordHash')
    })

    it('throws NotFoundException when the user does not exist', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(service.findById('missing-id')).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})
