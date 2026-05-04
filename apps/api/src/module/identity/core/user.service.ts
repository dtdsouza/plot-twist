import { Injectable, NotFoundException } from '@nestjs/common'
import { UserRepository } from '../persistence/repository/user.repository'
import { IUserResponse } from '../http/dto/auth-response.interface'
import { toUserResponse } from '../http/dto/user-response.mapper'

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
}
