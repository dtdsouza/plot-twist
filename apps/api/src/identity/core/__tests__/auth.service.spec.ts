import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { UserEntity } from "../../persistence/entity/user.entity";
import { EUserStatus } from "../../persistence/enum/user-status.enum";
import * as bcrypt from "bcryptjs";

jest.mock("bcryptjs");

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe("AuthService", () => {
  let service: AuthService;
  let mockRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let mockJwtService: {
    sign: jest.Mock;
  };

  const mockUser: UserEntity = {
    id: "uuid-123",
    email: "test@example.com",
    passwordHash: "hashed-password",
    displayName: "Test User",
    avatar: null,
    bio: null,
    status: EUserStatus.ACTIVE,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue("mock-jwt-token"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: mockRepository },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
    mockJwtService.sign.mockReturnValue("mock-jwt-token");
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    const registerDto = {
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    };

    it("should create a user and return an auth response", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);
      mockBcrypt.hash.mockResolvedValue("hashed-password" as never);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toEqual({
        accessToken: "mock-jwt-token",
        user: {
          id: mockUser.id,
          email: mockUser.email,
          displayName: mockUser.displayName,
          avatar: mockUser.avatar,
          bio: mockUser.bio,
          createdAt: mockUser.createdAt,
        },
      });
    });

    it("should hash the password with 12 salt rounds before saving", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);
      mockBcrypt.hash.mockResolvedValue("hashed-password" as never);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);

      // Act
      await service.register(registerDto);

      // Assert
      expect(mockBcrypt.hash).toHaveBeenCalledWith("password123", 12);
    });

    it("should throw ConflictException when email already exists", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException
      );
    });

    it("should not include passwordHash in the returned user object", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);
      mockBcrypt.hash.mockResolvedValue("hashed-password" as never);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result.user).not.toHaveProperty("passwordHash");
    });

    it("should sign JWT with sub and email payload", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);
      mockBcrypt.hash.mockResolvedValue("hashed-password" as never);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);

      // Act
      await service.register(registerDto);

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
      });
    });
  });

  describe("login", () => {
    const loginDto = {
      email: "test@example.com",
      password: "password123",
    };

    it("should return auth response when credentials are valid", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true as never);

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result).toEqual({
        accessToken: "mock-jwt-token",
        user: {
          id: mockUser.id,
          email: mockUser.email,
          displayName: mockUser.displayName,
          avatar: mockUser.avatar,
          bio: mockUser.bio,
          createdAt: mockUser.createdAt,
        },
      });
    });

    it("should throw UnauthorizedException when email is not found", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it("should throw UnauthorizedException when password is wrong", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(false as never);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it("should not include passwordHash in the returned user object", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true as never);

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result.user).not.toHaveProperty("passwordHash");
    });

    it("should use same error message for missing email and wrong password to prevent enumeration", async () => {
      // Arrange - missing email case
      mockRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        "Invalid credentials"
      );

      // Arrange - wrong password case
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(false as never);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        "Invalid credentials"
      );
    });

    it("should sign JWT with sub and email payload", async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true as never);

      // Act
      await service.login(loginDto);

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
      });
    });
  });
});
