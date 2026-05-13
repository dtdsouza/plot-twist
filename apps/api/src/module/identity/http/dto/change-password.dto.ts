import { IsString, MinLength, MaxLength } from 'class-validator'

export class ChangePasswordDto {
  @IsString()
  readonly currentPassword!: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  readonly newPassword!: string
}
