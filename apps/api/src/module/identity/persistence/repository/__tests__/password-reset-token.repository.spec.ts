import { Repository, FindOperator } from 'typeorm'
import { PasswordResetTokenRepository } from '../password-reset-token.repository'
import { PasswordResetTokenEntity } from '../../entity/password-reset-token.entity'

describe('PasswordResetTokenRepository', () => {
  let tokenRepository: PasswordResetTokenRepository
  let mockTypeormRepository: jest.Mocked<Repository<PasswordResetTokenEntity>>

  const mockToken: PasswordResetTokenEntity = {
    id: 'token-uuid-1',
    tokenHash: 'hashed-token-hex',
    userId: 'user-uuid-123',
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date('2024-01-01'),
  }

  beforeEach(() => {
    mockTypeormRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      merge: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<PasswordResetTokenEntity>>

    tokenRepository = new PasswordResetTokenRepository(mockTypeormRepository)
  })

  describe('findValidByTokenHash', () => {
    it('should find a valid non-expired token by hash', async () => {
      // Arrange
      mockTypeormRepository.findOne.mockResolvedValue(mockToken)

      // Act
      const result = await tokenRepository.findValidByTokenHash('hashed-token-hex')

      // Assert
      expect(result).toEqual(mockToken)
      expect(result).not.toBe(mockToken)
      expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
        where: {
          tokenHash: 'hashed-token-hex',
          expiresAt: expect.any(FindOperator),
        },
      })
    })

    it('should return null when token is not found or expired', async () => {
      // Arrange
      mockTypeormRepository.findOne.mockResolvedValue(null)

      // Act
      const result = await tokenRepository.findValidByTokenHash('missing-hash')

      // Assert
      expect(result).toBeNull()
    })
  })

  describe('create (inherited from BaseRepository)', () => {
    it('should create and return a spread copy of the token', async () => {
      // Arrange
      const createData = {
        tokenHash: 'new-hash',
        userId: 'user-uuid-123',
        expiresAt: new Date(),
      }
      mockTypeormRepository.create.mockReturnValue(mockToken)
      mockTypeormRepository.save.mockResolvedValue(mockToken)

      // Act
      const result = await tokenRepository.create(createData)

      // Assert
      expect(result).toEqual(mockToken)
      expect(result).not.toBe(mockToken)
      expect(mockTypeormRepository.create).toHaveBeenCalledWith(createData)
      expect(mockTypeormRepository.save).toHaveBeenCalled()
    })
  })

  describe('deleteAllForUser', () => {
    it('should call repository.delete with correct userId', async () => {
      // Arrange
      mockTypeormRepository.delete.mockResolvedValue({ affected: 2, raw: [] })

      // Act
      await tokenRepository.deleteAllForUser('user-uuid-123')

      // Assert
      expect(mockTypeormRepository.delete).toHaveBeenCalledWith({
        userId: 'user-uuid-123',
      })
    })
  })
})
