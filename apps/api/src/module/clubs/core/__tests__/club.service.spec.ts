import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { ClubService } from '../club.service'
import { ClubRepository } from '../../persistence/repository/club.repository'
import { MembershipRepository } from '../../persistence/repository/membership.repository'
import { ClubEntity } from '../../persistence/entity/club.entity'
import { MembershipEntity } from '../../persistence/entity/membership.entity'
import { EMembershipRole } from '../../persistence/enum/membership-role.enum'

const OWNER_ID = '11111111-1111-1111-1111-111111111111'
const MEMBER_ID = '22222222-2222-2222-2222-222222222222'
const CLUB_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function makeClub(overrides?: Partial<ClubEntity>): ClubEntity {
  return {
    id: CLUB_ID,
    name: 'Book Worms',
    description: 'A reading group',
    ownerId: OWNER_ID,
    coverImageUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as ClubEntity
}

describe('ClubService', () => {
  let service: ClubService
  let mockClubRepository: {
    findOne: jest.Mock
    update: jest.Mock
    delete: jest.Mock
    listForMember: jest.Mock
  }
  let mockMembershipRepository: {
    existsOwnership: jest.Mock
    findRoleForUser: jest.Mock
  }
  let mockDataSource: {
    transaction: jest.Mock
  }

  beforeEach(async () => {
    mockClubRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      listForMember: jest.fn(),
    }

    mockMembershipRepository = {
      existsOwnership: jest.fn(),
      findRoleForUser: jest.fn(),
    }

    mockDataSource = {
      transaction: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClubService,
        { provide: ClubRepository, useValue: mockClubRepository },
        { provide: MembershipRepository, useValue: mockMembershipRepository },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile()

    service = module.get<ClubService>(ClubService)
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('happy path: returns created club and issues both save calls with correct owner membership', async () => {
      // Arrange
      const dto = { name: 'Book Worms', description: 'A reading group' }
      const savedClub = makeClub()
      const mockManager = {
        create: jest.fn(),
        save: jest.fn(),
      }
      mockManager.create.mockImplementation(
        (_entity: unknown, data: Record<string, unknown>) => ({ ...data, id: CLUB_ID }),
      )
      mockManager.save
        .mockResolvedValueOnce(savedClub)  // club save
        .mockResolvedValueOnce({})         // membership save
      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: typeof mockManager) => Promise<ClubEntity>) => cb(mockManager),
      )

      // Act
      const result = await service.create(OWNER_ID, dto)

      // Assert — result is the entity returned by the transaction callback
      expect(result.id).toBe(CLUB_ID)
      expect(result.name).toBe(dto.name)
      expect(mockManager.save).toHaveBeenCalledTimes(2)

      // First call: the club entity
      const firstSaveArg = mockManager.save.mock.calls[0][0] as ClubEntity
      expect(firstSaveArg.name).toBe(dto.name)
      expect(firstSaveArg.ownerId).toBe(OWNER_ID)

      // Second call: the membership entity — must carry role=owner, userId=ownerId, joinedAt
      const secondSaveArg = mockManager.save.mock.calls[1][0] as MembershipEntity
      expect(secondSaveArg.role).toBe(EMembershipRole.OWNER)
      expect(secondSaveArg.userId).toBe(OWNER_ID)
      expect(secondSaveArg.joinedAt).toBeInstanceOf(Date)
    })

    it('rollback: error thrown during membership save propagates and no post-commit code runs', async () => {
      // Arrange
      const dto = { name: 'Rollback Club' }
      const mockManager = {
        create: jest.fn(),
        save: jest.fn(),
      }
      const savedClub = makeClub()
      mockManager.create.mockImplementation(
        (_entity: unknown, data: Record<string, unknown>) => ({ ...data, id: CLUB_ID }),
      )
      mockManager.save
        .mockResolvedValueOnce(savedClub)
        .mockRejectedValueOnce(new Error('Unique constraint violation'))
      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: typeof mockManager) => Promise<ClubEntity>) => cb(mockManager),
      )

      // Act & Assert
      await expect(service.create(OWNER_ID, dto)).rejects.toThrow('Unique constraint violation')
      // The DataSource.transaction itself threw — post-commit code (event seam) never reached
      expect(mockClubRepository.findOne).not.toHaveBeenCalled()
    })
  })

  describe('listForMember', () => {
    it('delegates to clubRepository.listForMember and returns its result', async () => {
      // Arrange
      const expected = [{ club: makeClub(), role: EMembershipRole.OWNER }]
      mockClubRepository.listForMember.mockResolvedValue(expected)

      // Act
      const result = await service.listForMember(OWNER_ID)

      // Assert
      expect(mockClubRepository.listForMember).toHaveBeenCalledWith(OWNER_ID)
      expect(result).toBe(expected)
    })
  })

  describe('findByIdForMember', () => {
    it('throws NotFoundException for non-member (role is null)', async () => {
      // Arrange
      mockMembershipRepository.findRoleForUser.mockResolvedValue(null)

      // Act & Assert
      await expect(service.findByIdForMember(CLUB_ID, MEMBER_ID)).rejects.toThrow(
        NotFoundException,
      )
      expect(mockClubRepository.findOne).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when club row is not found', async () => {
      // Arrange
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.MEMBER)
      mockClubRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(service.findByIdForMember(CLUB_ID, MEMBER_ID)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('returns club and role for a member', async () => {
      // Arrange
      const club = makeClub()
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.MEMBER)
      mockClubRepository.findOne.mockResolvedValue(club)

      // Act
      const result = await service.findByIdForMember(CLUB_ID, MEMBER_ID)

      // Assert
      expect(result).toEqual({ club, role: EMembershipRole.MEMBER })
    })
  })

  describe('updateAsOwner', () => {
    it('throws ForbiddenException for a non-owner', async () => {
      // Arrange
      const club = makeClub()
      mockClubRepository.findOne.mockResolvedValue(club)
      mockMembershipRepository.existsOwnership.mockResolvedValue(false)

      // Act & Assert
      await expect(
        service.updateAsOwner(CLUB_ID, MEMBER_ID, { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException)
      expect(mockClubRepository.update).not.toHaveBeenCalled()
    })

    it('happy path: calls repository.update with whitelisted fields only', async () => {
      // Arrange
      const club = makeClub()
      const updated = makeClub({ name: 'New Name' })
      mockClubRepository.findOne.mockResolvedValue(club)
      mockMembershipRepository.existsOwnership.mockResolvedValue(true)
      mockClubRepository.update.mockResolvedValue(updated)

      // Act
      const result = await service.updateAsOwner(CLUB_ID, OWNER_ID, { name: 'New Name' })

      // Assert
      expect(mockClubRepository.update).toHaveBeenCalledWith(CLUB_ID, { name: 'New Name' })
      expect(result).toBe(updated)
    })

    it('does not call repository.update when dto has no fields', async () => {
      // Arrange
      const club = makeClub()
      mockClubRepository.findOne.mockResolvedValue(club)
      mockMembershipRepository.existsOwnership.mockResolvedValue(true)

      // Act
      const result = await service.updateAsOwner(CLUB_ID, OWNER_ID, {})

      // Assert
      expect(mockClubRepository.update).not.toHaveBeenCalled()
      expect(result).toBe(club)
    })

    it('throws NotFoundException when club is not found', async () => {
      // Arrange
      mockClubRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(
        service.updateAsOwner(CLUB_ID, OWNER_ID, { name: 'X' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteAsOwner', () => {
    it('throws ForbiddenException for non-owner', async () => {
      // Arrange
      const club = makeClub()
      mockClubRepository.findOne.mockResolvedValue(club)
      mockMembershipRepository.existsOwnership.mockResolvedValue(false)

      // Act & Assert
      await expect(service.deleteAsOwner(CLUB_ID, MEMBER_ID)).rejects.toThrow(
        ForbiddenException,
      )
      expect(mockClubRepository.delete).not.toHaveBeenCalled()
    })

    it('happy path: calls repository.delete for the owner', async () => {
      // Arrange
      const club = makeClub()
      mockClubRepository.findOne.mockResolvedValue(club)
      mockMembershipRepository.existsOwnership.mockResolvedValue(true)
      mockClubRepository.delete.mockResolvedValue(undefined)

      // Act
      await service.deleteAsOwner(CLUB_ID, OWNER_ID)

      // Assert
      expect(mockClubRepository.delete).toHaveBeenCalledWith(CLUB_ID)
    })

    it('throws NotFoundException when club is not found', async () => {
      // Arrange
      mockClubRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(service.deleteAsOwner(CLUB_ID, OWNER_ID)).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})
