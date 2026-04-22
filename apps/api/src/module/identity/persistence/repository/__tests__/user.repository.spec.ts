import { ConflictException } from '@nestjs/common'
import { Repository, QueryFailedError } from 'typeorm'
import { UserRepository } from '../user.repository'
import { UserEntity } from '../../entity/user.entity'
import { EUserStatus } from '../../enum/user-status.enum'

describe('UserRepository', () => {
  let userRepository: UserRepository
  let mockTypeormRepository: jest.Mocked<Repository<UserEntity>>

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

  const createData = {
    email: 'new@example.com',
    passwordHash: 'hashed',
    displayName: 'New User',
  }

  beforeEach(() => {
    mockTypeormRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      merge: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserEntity>>

    userRepository = new UserRepository(mockTypeormRepository)
  })

  it('should delegate findOne to BaseRepository', async () => {
    // Arrange
    mockTypeormRepository.findOne.mockResolvedValue(mockUser)

    // Act
    const result = await userRepository.findOne({ email: 'test@example.com' } as any)

    // Assert
    expect(result).toEqual(mockUser)
    expect(result).not.toBe(mockUser)
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    })
  })

  it('should delegate create to BaseRepository', async () => {
    // Arrange
    mockTypeormRepository.create.mockReturnValue(mockUser)
    mockTypeormRepository.save.mockResolvedValue(mockUser)

    // Act
    const result = await userRepository.create(createData)

    // Assert
    expect(result).toEqual(mockUser)
    expect(result).not.toBe(mockUser)
    expect(mockTypeormRepository.create).toHaveBeenCalledWith(createData)
  })

  it('should convert Postgres unique-violation (23505) into ConflictException', async () => {
    // Arrange -- simulate concurrent insert that races past the pre-check
    const pgError = new QueryFailedError(
      'insert into user ...',
      [],
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    )
    mockTypeormRepository.create.mockReturnValue(mockUser)
    mockTypeormRepository.save.mockRejectedValue(pgError)

    // Act & Assert
    await expect(userRepository.create(createData)).rejects.toThrow(
      ConflictException,
    )
    await expect(userRepository.create(createData)).rejects.toThrow(
      'A user with this email already exists',
    )
  })

  it('should rethrow non-unique QueryFailedError unchanged', async () => {
    // Arrange
    const otherError = new QueryFailedError(
      'insert into user ...',
      [],
      Object.assign(new Error('not-null violation'), { code: '23502' }),
    )
    mockTypeormRepository.create.mockReturnValue(mockUser)
    mockTypeormRepository.save.mockRejectedValue(otherError)

    // Act & Assert
    await expect(userRepository.create(createData)).rejects.toBe(otherError)
  })

  it('should delegate findMany to BaseRepository', async () => {
    // Arrange
    mockTypeormRepository.find.mockResolvedValue([mockUser])

    // Act
    const result = await userRepository.findMany({
      where: { status: EUserStatus.ACTIVE } as any,
    })

    // Assert
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(mockUser)
    expect(result[0]).not.toBe(mockUser)
  })
})
