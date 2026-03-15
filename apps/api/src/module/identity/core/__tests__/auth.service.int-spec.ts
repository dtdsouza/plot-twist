import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { Client } from "pg";
import { AuthService } from "../auth.service";
import { UserEntity } from "../../persistence/entity/user.entity";

const DB_HOST = process.env.DB_HOST ?? "127.0.0.1";
const DB_PORT = parseInt(process.env.DB_PORT ?? "5432", 10);
const DB_USERNAME = process.env.DB_USERNAME ?? "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "postgres";
const DB_NAME = process.env.DB_NAME ?? "plot-twist";

describe("AuthService (integration)", () => {
  let service: AuthService;
  let dataSource: DataSource;
  let module: TestingModule;

  beforeAll(async () => {
    // Create the identity schema before TypeORM synchronize runs
    const pgClient = new Client({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USERNAME,
      password: DB_PASSWORD,
      database: DB_NAME,
    });
    await pgClient.connect();
    await pgClient.query("CREATE SCHEMA IF NOT EXISTS identity");
    await pgClient.end();

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "postgres",
          host: DB_HOST,
          port: DB_PORT,
          username: DB_USERNAME,
          password: DB_PASSWORD,
          database: DB_NAME,
          entities: [UserEntity],
          // Use synchronize in test environment to avoid migration dependency
          synchronize: true,
        }),
        TypeOrmModule.forFeature([UserEntity]),
        JwtModule.register({
          secret: "test-secret",
          signOptions: { expiresIn: "1h" },
        }),
      ],
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
    dataSource = module.get<DataSource>(DataSource);
  });

  beforeEach(async () => {
    // Clean up only this suite's rows to allow parallel execution with other test files
    await dataSource.query(`DELETE FROM identity."user" WHERE email LIKE $1`, ['%@int.test']);
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM identity."user" WHERE email LIKE $1`, ['%@int.test']);
    await module?.close();
  });

  describe("register", () => {
    it("should persist user to database", async () => {
      // Arrange
      const dto = {
        email: "integration@int.test",
        password: "password123",
        displayName: "Integration User",
      };

      // Act
      const result = await service.register(dto);

      // Assert
      const users = await dataSource.query(
        `SELECT * FROM identity."user" WHERE email = $1`,
        [dto.email]
      );
      expect(users).toHaveLength(1);
      expect(result.user.id).toBe(users[0].id);
    });

    it("should store hashed password, not plaintext", async () => {
      // Arrange
      const dto = {
        email: "hash@int.test",
        password: "password123",
        displayName: "Hash Test",
      };

      // Act
      await service.register(dto);

      // Assert
      const users = await dataSource.query(
        `SELECT * FROM identity."user" WHERE email = $1`,
        [dto.email]
      );
      expect(users[0].passwordHash).not.toBe(dto.password);
      expect(users[0].passwordHash).toMatch(/^\$2[ab]\$/);
    });

    it("should throw ConflictException for duplicate email", async () => {
      // Arrange
      const dto = {
        email: "duplicate@int.test",
        password: "password123",
        displayName: "Duplicate User",
      };
      await service.register(dto);

      // Act & Assert
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it("should return auth response with accessToken and user data", async () => {
      // Arrange
      const dto = {
        email: "response@int.test",
        password: "password123",
        displayName: "Response User",
      };

      // Act
      const result = await service.register(dto);

      // Assert
      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe(dto.email);
      expect(result.user.displayName).toBe(dto.displayName);
      expect(result.user).not.toHaveProperty("passwordHash");
    });
  });

  describe("login", () => {
    it("should succeed after register", async () => {
      // Arrange
      const registerDto = {
        email: "login@int.test",
        password: "password123",
        displayName: "Login User",
      };
      await service.register(registerDto);

      // Act
      const result = await service.login({
        email: registerDto.email,
        password: registerDto.password,
      });

      // Assert
      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe(registerDto.email);
    });

    it("should throw UnauthorizedException for wrong password", async () => {
      // Arrange
      const registerDto = {
        email: "wrongpass@int.test",
        password: "correct-password",
        displayName: "Wrong Pass User",
      };
      await service.register(registerDto);

      // Act & Assert
      await expect(
        service.login({ email: registerDto.email, password: "wrong-password" })
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException for non-existent user", async () => {
      // Act & Assert
      await expect(
        service.login({ email: "nobody@int.test", password: "password123" })
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
