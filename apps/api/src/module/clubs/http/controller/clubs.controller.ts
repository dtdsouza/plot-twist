import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard, CurrentUser, type IJwtPayload } from '@module/shared/auth'
import { ClubService } from '../../core/club.service'
import { ClubCoverService } from '../../core/club-cover.service'
import { CreateClubDto } from '../dto/create-club.dto'
import { UpdateClubDto } from '../dto/update-club.dto'
import { CoverUploadIntentDto } from '../dto/cover-upload-intent.dto'
import { FinalizeCoverDto } from '../dto/finalize-cover.dto'
import { toClubResponse } from '../dto/club-response.mapper'
import type { IClubResponse } from '../dto/club-response.interface'
import type { IClubCoverUploadIntentResponse } from '../dto/cover-upload-intent-response.interface'
import { EMembershipRole } from '../../persistence/enum/membership-role.enum'

@Controller('clubs')
@UseGuards(JwtAuthGuard)
export class ClubsController {
  constructor(
    private readonly clubService: ClubService,
    private readonly clubCoverService: ClubCoverService,
  ) {}

  @Post()
  async create(
    @CurrentUser() current: IJwtPayload,
    @Body() dto: CreateClubDto,
  ): Promise<IClubResponse> {
    const club = await this.clubService.create(current.sub, dto)
    return toClubResponse(club, EMembershipRole.OWNER)
  }

  @Get()
  async list(@CurrentUser() current: IJwtPayload): Promise<IClubResponse[]> {
    const items = await this.clubService.listForMember(current.sub)
    return items.map(({ club, role }) => toClubResponse(club, role))
  }

  @Get(':id')
  async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
  ): Promise<IClubResponse> {
    const { club, role } = await this.clubService.findByIdForMember(id, current.sub)
    return toClubResponse(club, role)
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
    @Body() dto: UpdateClubDto,
  ): Promise<IClubResponse> {
    const club = await this.clubService.updateAsOwner(id, current.sub, dto)
    const role = await this.resolveRole(id, current.sub)
    return toClubResponse(club, role)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
  ): Promise<void> {
    await this.clubService.deleteAsOwner(id, current.sub)
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
  ): Promise<void> {
    await this.clubService.leave(id, current.sub)
  }

  @Post(':id/cover/upload-intent')
  @HttpCode(HttpStatus.OK)
  async initiateCover(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
    @Body() dto: CoverUploadIntentDto,
  ): Promise<IClubCoverUploadIntentResponse> {
    return this.clubCoverService.requestUploadIntent(id, current.sub, dto)
  }

  @Post(':id/cover/finalize')
  @HttpCode(HttpStatus.OK)
  async finalizeCover(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: IJwtPayload,
    @Body() dto: FinalizeCoverDto,
  ): Promise<IClubResponse> {
    const club = await this.clubCoverService.finalize(id, current.sub, dto.key)
    const role = await this.resolveRole(id, current.sub)
    return toClubResponse(club, role)
  }

  // Resolves the caller's role for use in response shapes that include it.
  // Called after write operations where the service already verified ownership
  // (so the membership row is guaranteed to exist).
  private async resolveRole(
    clubId: string,
    userId: string,
  ): Promise<EMembershipRole | null> {
    const { role } = await this.clubService.findByIdForMember(clubId, userId)
    return role
  }
}
