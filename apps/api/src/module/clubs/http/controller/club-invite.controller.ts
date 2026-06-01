import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard, CurrentUser, type IJwtPayload } from '@module/shared/auth'
import { ClubInviteService, type IClubInviteResult } from '../../core/club-invite.service'
import { ClubService } from '../../core/club.service'
import { EmailInviteDto } from '../dto/email-invite.dto'
import { toClubResponse } from '../dto/club-response.mapper'
import type { IClubInviteResponse } from '../dto/club-invite-response.interface'
import type { IClubInvitePreviewResponse } from '../dto/club-invite-preview-response.interface'
import type { IClubResponse } from '../dto/club-response.interface'

@Controller('clubs')
export class ClubInviteController {
  constructor(
    private readonly clubInviteService: ClubInviteService,
    private readonly clubService: ClubService,
  ) {}

  @Get(':id/invite')
  @UseGuards(JwtAuthGuard)
  async getInvite(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
  ): Promise<IClubInviteResponse> {
    const result = await this.clubInviteService.getOrCreateActive(id, current.sub)
    return this.toInviteResponse(result)
  }

  @Post(':id/invite/rotate')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async rotateInvite(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
  ): Promise<IClubInviteResponse> {
    const result = await this.clubInviteService.rotate(id, current.sub)
    return this.toInviteResponse(result)
  }

  @Delete(':id/invite')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvite(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
  ): Promise<void> {
    await this.clubInviteService.revoke(id, current.sub)
  }

  @Post(':id/invite/email')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async emailInvite(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
    @Body() dto: EmailInviteDto,
  ): Promise<void> {
    await this.clubInviteService.email(id, current.sub, dto.emails)
  }

  @Get('join/:token')
  async previewInvite(
    @Param('token') token: string,
  ): Promise<IClubInvitePreviewResponse> {
    return this.clubInviteService.preview(token)
  }

  @Post('join/:token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async redeemInvite(
    @Param('token') token: string,
    @CurrentUser() current: IJwtPayload,
  ): Promise<IClubResponse> {
    const club = await this.clubInviteService.redeem(token, current.sub)
    const { role } = await this.clubService.findByIdForMember(club.id, current.sub)
    return toClubResponse(club, role)
  }

  private toInviteResponse(result: IClubInviteResult): IClubInviteResponse {
    return {
      token: result.token,
      url: result.url,
      expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
    }
  }
}
