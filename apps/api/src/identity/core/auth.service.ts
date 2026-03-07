import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { UserEntity } from '../persistence/entity/user.entity'
import { RegisterDto } from '../http/dto/register.dto'
import { LoginDto } from '../http/dto/login.dto'
import { IAuthResponse, IUserResponse } from '../http/dto/auth-response.interface'

const BCRYPT_SALT_ROUNDS = 12

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Identity.AuthService')

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<IAuthResponse> {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    })

    if (existingUser) {
      throw new ConflictException('A user with this email already exists')
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS)

    const entity = this.userRepository.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
    })

    const savedUser = await this.userRepository.save(entity)

    this.logger.log(`User registered: ${savedUser.id}`)

    return this.buildAuthResponse(savedUser)
  }

  async login(dto: LoginDto): Promise<IAuthResponse> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    })

    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash)

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials')
    }

    this.logger.log(`User logged in: ${user.id}`)

    return this.buildAuthResponse(user)
  }

  private buildAuthResponse(user: UserEntity): IAuthResponse {
    const payload = { sub: user.id, email: user.email }
    const accessToken = this.jwtService.sign(payload)

    return {
      accessToken,
      user: this.toUserResponse(user),
    }
  }

  private toUserResponse(user: UserEntity): IUserResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      createdAt: user.createdAt,
    }
  }
}
