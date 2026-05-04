import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common'
import { UserService } from '../../core/user.service'
import { JwtAuthGuard } from '../guard/jwt-auth.guard'
import { CurrentUser } from '../decorator/current-user.decorator'
import type { IUserResponse } from '../dto/auth-response.interface'
import type { IJwtPayload } from '../dto/jwt-payload.interface'

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getMe(@CurrentUser() current: IJwtPayload): Promise<IUserResponse> {
    return this.userService.findById(current.sub)
  }

  @Get(':id')
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<IUserResponse> {
    return this.userService.findById(id)
  }
}
