import { IsOptional, IsString, Length, MaxLength } from 'class-validator'

// coverImageUrl is intentionally omitted. With whitelist + forbidNonWhitelisted
// on the global ValidationPipe, any client sending that field receives a 400.
// The two-phase upload flow (upload-intent + finalize) is the only valid path
// for updating the cover image (design.md D5).
export class UpdateClubDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly name?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly description?: string
}
