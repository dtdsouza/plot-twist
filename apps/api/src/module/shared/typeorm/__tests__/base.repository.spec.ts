import { NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { BaseRepository } from "../base.repository";
import { BaseEntity } from "../base.entity";

class TestEntity extends BaseEntity {
  name!: string;
}

class TestRepository extends BaseRepository<TestEntity> {
  constructor(repository: Repository<TestEntity>) {
    super(repository);
  }
}

describe("BaseRepository", () => {
  let testRepository: TestRepository;
  let mockTypeormRepository: jest.Mocked<Repository<TestEntity>>;

  const mockEntity: TestEntity = {
    id: "uuid-123",
    name: "Test",
    createdAt: new Date("2024-01-01"),
  };

  beforeEach(() => {
    mockTypeormRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      merge: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<TestEntity>>;

    testRepository = new TestRepository(mockTypeormRepository);
  });

  describe("findOne", () => {
    it("should return a spread copy when entity is found", async () => {
      // Arrange
      mockTypeormRepository.findOne.mockResolvedValue(mockEntity);

      // Act
      const result = await testRepository.findOne({ id: "uuid-123" } as any);

      // Assert
      expect(result).toEqual(mockEntity);
      expect(result).not.toBe(mockEntity);
      expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
        where: { id: "uuid-123" },
      });
    });

    it("should return null when entity is not found", async () => {
      // Arrange
      mockTypeormRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await testRepository.findOne({ id: "missing" } as any);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("findMany", () => {
    it("should return array of spread copies", async () => {
      // Arrange
      const entities = [
        mockEntity,
        { ...mockEntity, id: "uuid-456", name: "Test 2" },
      ];
      mockTypeormRepository.find.mockResolvedValue(entities);

      // Act
      const result = await testRepository.findMany({
        where: { name: "Test" } as any,
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(entities[0]);
      expect(result[0]).not.toBe(entities[0]);
      expect(result[1]).not.toBe(entities[1]);
    });

    it("should return empty array when no results", async () => {
      // Arrange
      mockTypeormRepository.find.mockResolvedValue([]);

      // Act
      const result = await testRepository.findMany();

      // Assert
      expect(result).toEqual([]);
    });

    it("should pass take, skip, and order options to repository", async () => {
      // Arrange
      mockTypeormRepository.find.mockResolvedValue([]);

      // Act
      await testRepository.findMany({
        where: { name: "Test" } as any,
        take: 10,
        skip: 5,
        order: { createdAt: "DESC" } as any,
      });

      // Assert
      expect(mockTypeormRepository.find).toHaveBeenCalledWith({
        where: { name: "Test" },
        take: 10,
        skip: 5,
        order: { createdAt: "DESC" },
      });
    });
  });

  describe("create", () => {
    it("should create entity, save it, and return a spread copy", async () => {
      // Arrange
      const createData = { name: "New Entity" };
      const createdEntity = { ...mockEntity, name: "New Entity" };
      mockTypeormRepository.create.mockReturnValue(createdEntity as TestEntity);
      mockTypeormRepository.save.mockResolvedValue(createdEntity as TestEntity);

      // Act
      const result = await testRepository.create(createData as any);

      // Assert
      expect(result).toEqual(createdEntity);
      expect(result).not.toBe(createdEntity);
      expect(mockTypeormRepository.create).toHaveBeenCalledWith(createData);
      expect(mockTypeormRepository.save).toHaveBeenCalledWith(createdEntity);
    });
  });

  describe("update", () => {
    it("should find entity, merge data, save, and return spread copy", async () => {
      // Arrange
      const updateData = { name: "Updated" };
      const mergedEntity = { ...mockEntity, name: "Updated" };
      mockTypeormRepository.findOne.mockResolvedValue(mockEntity);
      mockTypeormRepository.merge.mockReturnValue(mergedEntity as TestEntity);
      mockTypeormRepository.save.mockResolvedValue(mergedEntity as TestEntity);

      // Act
      const result = await testRepository.update("uuid-123", updateData as any);

      // Assert
      expect(result).toEqual(mergedEntity);
      expect(result).not.toBe(mergedEntity);
      expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
        where: { id: "uuid-123" },
      });
      expect(mockTypeormRepository.merge).toHaveBeenCalledWith(
        mockEntity,
        updateData
      );
    });

    it("should throw NotFoundException when entity does not exist", async () => {
      // Arrange
      mockTypeormRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        testRepository.update("missing-id", { name: "Updated" } as any)
      ).rejects.toThrow(NotFoundException);
      await expect(
        testRepository.update("missing-id", { name: "Updated" } as any)
      ).rejects.toThrow("Entity with id missing-id not found");
    });
  });

  describe("delete", () => {
    it("should find entity and remove it", async () => {
      // Arrange
      mockTypeormRepository.findOne.mockResolvedValue(mockEntity);
      mockTypeormRepository.remove.mockResolvedValue(mockEntity);

      // Act
      await testRepository.delete("uuid-123");

      // Assert
      expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
        where: { id: "uuid-123" },
      });
      expect(mockTypeormRepository.remove).toHaveBeenCalledWith(mockEntity);
    });

    it("should throw NotFoundException when entity does not exist", async () => {
      // Arrange
      mockTypeormRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(testRepository.delete("missing-id")).rejects.toThrow(
        NotFoundException
      );
      await expect(testRepository.delete("missing-id")).rejects.toThrow(
        "Entity with id missing-id not found"
      );
    });
  });
});
