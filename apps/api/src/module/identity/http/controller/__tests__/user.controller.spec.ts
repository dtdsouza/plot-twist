import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { UserController } from '../user.controller'
import { UserService } from '../../../core/user.service'
import { EmailChangeService } from '../../../core/email-change.service'
import { AvatarService } from '../../../core/avatar.service'
import { JwtAuthGuard } from '../../guard/jwt-auth.guard'
import { IUserResponse } from '../../dto/auth-response.interface'
import { IJwtPayload } from '../../dto/jwt-payload.interface'

describe('UserController', () => {
  let controller: UserController
  let mockUserService: { findById: jest.Mock }
  let mockEmailChangeService: { initiate: jest.Mock }
  let mockAvatarService: { initiateUpload: jest.Mock; finalize: jest.Mock }

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
    mockEmailChangeService = {
      initiate: jest.fn().mockResolvedValue({ message: 'Check your new inbox' }),
    }
    mockAvatarService = {
      initiateUpload: jest.fn(),
      finalize: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: EmailChangeService, useValue: mockEmailChangeService },
        { provide: AvatarService, useValue: mockAvatarService },
      ],
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

  describe('initiateEmailChange', () => {
    it('delegates to the email-change service using the JWT subject', async () => {
      // Arrange
      const dto = {
        currentPassword: 'pw123',
        newEmail: 'new@example.com',
      }

      // Act
      const result = await controller.initiateEmailChange(mockCurrentUser, dto as never)

      // Assert
      expect(mockEmailChangeService.initiate).toHaveBeenCalledWith(
        mockCurrentUser.sub,
        dto,
      )
      expect(result).toEqual({ message: 'Check your new inbox' })
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

  describe('createAvatarUploadIntent', () => {
    it('delegates to AvatarService using the JWT subject', async () => {
      // Arrange
      const dto = { contentType: 'image/jpeg', contentLength: 100_000 }
      const expectedResponse = {
        url: 'https://s3/example',
        fields: {},
        key: 'avatars/pending/u/up',
        expiresAt: '2026-05-13T12:05:00.000Z',
        limits: {
          maxContentLength: 2_097_152,
          maxDimension: 2048,
          allowedMime: ['image/jpeg'],
        },
      }
      mockAvatarService.initiateUpload.mockResolvedValue(expectedResponse)

      // Act
      const result = await controller.createAvatarUploadIntent(
        mockCurrentUser,
        dto as never,
      )

      // Assert
      expect(mockAvatarService.initiateUpload).toHaveBeenCalledWith(
        mockCurrentUser.sub,
        dto,
      )
      expect(result).toEqual(expectedResponse)
    })
  })

  describe('finalizeAvatarUpload', () => {
    it('delegates to AvatarService with the upload key', async () => {
      // Arrange
      const dto = { uploadKey: 'avatars/pending/uuid-123/some-id' }
      mockAvatarService.finalize.mockResolvedValue(mockUserResponse)

      // Act
      const result = await controller.finalizeAvatarUpload(
        mockCurrentUser,
        dto as never,
      )

      // Assert
      expect(mockAvatarService.finalize).toHaveBeenCalledWith(
        mockCurrentUser.sub,
        dto.uploadKey,
      )
      expect(result).toEqual(mockUserResponse)
    })
  })
})
