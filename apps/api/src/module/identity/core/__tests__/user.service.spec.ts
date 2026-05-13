import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { UserService } from '../user.service'
import { UserRepository } from '../../persistence/repository/user.repository'
import { UserEntity } from '../../persistence/entity/user.entity'
import { EUserStatus } from '../../persistence/enum/user-status.enum'

describe('UserService', () => {
  let service: UserService
  let mockUserRepository: { findOne: jest.Mock; update: jest.Mock }

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
    mockUserRepository = { findOne: jest.fn(), update: jest.fn() }

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

  describe('updateProfile', () => {
    it('persists all three fields and returns the mapped response', async () => {
      // Arrange
      const dto = {
        displayName: 'New Name',
        bio: 'A short bio',
        avatar: 'https://cdn.example.com/avatar.png',
      }
      const updated: UserEntity = {
        ...mockUser,
        displayName: dto.displayName,
        bio: dto.bio,
        avatar: dto.avatar,
      }
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockUserRepository.update.mockResolvedValue(updated)

      // Act
      const result = await service.updateProfile(mockUser.id, dto)

      // Assert
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ id: mockUser.id })
      expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, {
        displayName: dto.displayName,
        bio: dto.bio,
        avatar: dto.avatar,
      })
      expect(result).toEqual({
        id: updated.id,
        email: updated.email,
        displayName: dto.displayName,
        avatar: dto.avatar,
        bio: dto.bio,
        createdAt: updated.createdAt,
      })
    })

    it('updates only the present DTO key and leaves others untouched', async () => {
      // Arrange
      const dto = { bio: 'Only the bio changed' }
      const updated: UserEntity = { ...mockUser, bio: dto.bio }
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockUserRepository.update.mockResolvedValue(updated)

      // Act
      const result = await service.updateProfile(mockUser.id, dto)

      // Assert
      expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, {
        bio: dto.bio,
      })
      expect(result.bio).toBe(dto.bio)
      expect(result.displayName).toBe(mockUser.displayName)
      expect(result.avatar).toBe(mockUser.avatar)
    })

    it('returns the user unchanged when the DTO has no fields', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)

      // Act
      const result = await service.updateProfile(mockUser.id, {})

      // Assert
      expect(mockUserRepository.update).not.toHaveBeenCalled()
      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        displayName: mockUser.displayName,
        avatar: mockUser.avatar,
        bio: mockUser.bio,
        createdAt: mockUser.createdAt,
      })
    })

    it('throws NotFoundException when the user does not exist', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(
        service.updateProfile('missing-id', { bio: 'noop' }),
      ).rejects.toThrow(NotFoundException)
      expect(mockUserRepository.update).not.toHaveBeenCalled()
    })
  })
})
