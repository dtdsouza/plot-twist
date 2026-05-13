import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { UserService } from '../../core/user.service'
import {
  EmailChangeService,
  type IEmailChangeInitiateResult,
} from '../../core/email-change.service'
import { JwtAuthGuard } from '../guard/jwt-auth.guard'
import { CurrentUser } from '../decorator/current-user.decorator'
import type { IUserResponse } from '../dto/auth-response.interface'
import type { IJwtPayload } from '../dto/jwt-payload.interface'
import { UpdateProfileDto } from '../dto/update-profile.dto'
import { EmailChangeInitiateDto } from '../dto/email-change-initiate.dto'

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly emailChangeService: EmailChangeService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() current: IJwtPayload): Promise<IUserResponse> {
    return this.userService.findById(current.sub)
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() current: IJwtPayload,
    @Body() dto: UpdateProfileDto,
  ): Promise<IUserResponse> {
    return this.userService.updateProfile(current.sub, dto)
  }

  @Post('me/email-change')
  @HttpCode(HttpStatus.OK)
  async initiateEmailChange(
    @CurrentUser() current: IJwtPayload,
    @Body() dto: EmailChangeInitiateDto,
  ): Promise<IEmailChangeInitiateResult> {
    return this.emailChangeService.initiate(current.sub, dto)
  }

  @Get(':id')
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<IUserResponse> {
    return this.userService.findById(id)
  }
}
