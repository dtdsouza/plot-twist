import { Injectable, NotFoundException } from '@nestjs/common'
import type { DeepPartial } from 'typeorm'
import { UserRepository } from '../persistence/repository/user.repository'
import { UserEntity } from '../persistence/entity/user.entity'
import { IUserResponse } from '../http/dto/auth-response.interface'
import { toUserResponse } from '../http/dto/user-response.mapper'
import { UpdateProfileDto } from '../http/dto/update-profile.dto'

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findById(id: string): Promise<IUserResponse> {
    const user = await this.userRepository.findOne({ id })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return toUserResponse(user)
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<IUserResponse> {
    const existing = await this.userRepository.findOne({ id })

    if (!existing) {
      throw new NotFoundException('User not found')
    }

    const patch: DeepPartial<UserEntity> = {}
    if (dto.displayName !== undefined) patch.displayName = dto.displayName
    if (dto.bio !== undefined) patch.bio = dto.bio
    if (dto.avatar !== undefined) patch.avatar = dto.avatar

    if (Object.keys(patch).length === 0) {
      return toUserResponse(existing)
    }

    const updated = await this.userRepository.update(id, patch)
    return toUserResponse(updated)
  }
}
