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
import { AvatarService } from '../../core/avatar.service'
import { JwtAuthGuard, CurrentUser, type IJwtPayload } from '@module/shared/auth'
import type { IUserResponse } from '../dto/auth-response.interface'
import { UpdateProfileDto } from '../dto/update-profile.dto'
import { EmailChangeInitiateDto } from '../dto/email-change-initiate.dto'
import { AvatarUploadIntentDto } from '../dto/avatar-upload-intent.dto'
import { AvatarFinalizeDto } from '../dto/avatar-finalize.dto'
import type { IAvatarUploadIntentResponse } from '../dto/avatar-upload-intent-response.interface'

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly emailChangeService: EmailChangeService,
    private readonly avatarService: AvatarService,
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

  @Post('me/avatar/upload-intent')
  @HttpCode(HttpStatus.OK)
  async createAvatarUploadIntent(
    @CurrentUser() current: IJwtPayload,
    @Body() dto: AvatarUploadIntentDto,
  ): Promise<IAvatarUploadIntentResponse> {
    return this.avatarService.initiateUpload(current.sub, dto)
  }

  @Post('me/avatar/finalize')
  @HttpCode(HttpStatus.OK)
  async finalizeAvatarUpload(
    @CurrentUser() current: IJwtPayload,
    @Body() dto: AvatarFinalizeDto,
  ): Promise<IUserResponse> {
    return this.avatarService.finalize(current.sub, dto.uploadKey)
  }

  @Get(':id')
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<IUserResponse> {
    return this.userService.findById(id)
  }
}
