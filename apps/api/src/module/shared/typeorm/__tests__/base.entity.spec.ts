import { getMetadataArgsStorage, Entity, Column } from "typeorm";
import { BaseEntity } from "../base.entity";

@Entity({ schema: "test", name: "test_entity" })
class TestEntity extends BaseEntity {
  @Column({ type: "varchar", length: 255 })
  name!: string;
}

describe("BaseEntity", () => {
  it("should register id and createdAt column metadata on a subclass", () => {
    // Arrange
    const storage = getMetadataArgsStorage();
    const columns = storage.columns.filter(
      (col) => col.target === TestEntity || col.target === BaseEntity
    );
    const columnNames = columns.map((col) => col.propertyName);

    // Assert
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("createdAt");
  });

  it("should declare id as a primary column of type uuid (not DB-generated)", () => {
    // Arrange
    const storage = getMetadataArgsStorage();
    const idColumn = storage.columns.find(
      (col) => col.target === BaseEntity && col.propertyName === "id"
    );
    const dbGenerated = storage.generations.filter(
      (gen) => gen.target === BaseEntity
    );

    // Assert
    expect(idColumn).toBeDefined();
    expect(idColumn?.options.primary).toBe(true);
    expect(idColumn?.options.type).toBe("uuid");
    expect(dbGenerated).toHaveLength(0);
  });

  it("should register a @BeforeInsert listener on BaseEntity", () => {
    // Arrange
    const storage = getMetadataArgsStorage();
    const listeners = storage.entityListeners.filter(
      (l) => l.target === BaseEntity
    );

    // Assert
    expect(listeners.some((l) => l.type === "before-insert")).toBe(true);
  });

  it("should assign a UUID to id when BeforeInsert hook runs on an entity without id", () => {
    // Arrange
    const entity = new TestEntity();

    // Act -- invoke the hook directly (simulates TypeORM's before-insert dispatch)
    (
      entity as unknown as { assignIdentityFields: () => void }
    ).assignIdentityFields();

    // Assert
    expect(entity.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("should NOT overwrite an existing id when BeforeInsert runs", () => {
    // Arrange
    const entity = new TestEntity();
    entity.id = "00000000-0000-0000-0000-000000000001";

    // Act
    (
      entity as unknown as { assignIdentityFields: () => void }
    ).assignIdentityFields();

    // Assert
    expect(entity.id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("should assign current Date to createdAt when BeforeInsert hook runs on an entity without createdAt", () => {
    // Arrange
    const entity = new TestEntity();
    const before = Date.now();

    // Act
    (
      entity as unknown as { assignIdentityFields: () => void }
    ).assignIdentityFields();
    const after = Date.now();

    // Assert
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(entity.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("should NOT overwrite an existing createdAt when BeforeInsert runs", () => {
    // Arrange
    const entity = new TestEntity();
    const fixedDate = new Date("2020-01-01T00:00:00Z");
    entity.createdAt = fixedDate;

    // Act
    (
      entity as unknown as { assignIdentityFields: () => void }
    ).assignIdentityFields();

    // Assert
    expect(entity.createdAt).toBe(fixedDate);
  });

  it("should NOT register BaseEntity itself as an entity in metadata", () => {
    // Arrange
    const storage = getMetadataArgsStorage();
    const entityTargets = storage.tables.map((table) => table.target);

    // Assert
    expect(entityTargets).not.toContain(BaseEntity);
  });

  it("should register the concrete subclass as an entity in metadata", () => {
    // Arrange
    const storage = getMetadataArgsStorage();
    const testEntityTable = storage.tables.find(
      (table) => table.target === TestEntity
    );

    // Assert
    expect(testEntityTable).toBeDefined();
    expect(testEntityTable?.schema).toBe("test");
    expect(testEntityTable?.name).toBe("test_entity");
  });
});
