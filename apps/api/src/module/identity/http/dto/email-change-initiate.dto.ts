import { IsEmail, IsNotEmpty, IsString } from 'class-validator'

export class EmailChangeInitiateDto {
  @IsString()
  @IsNotEmpty()
  readonly currentPassword!: string

  @IsEmail()
  readonly newEmail!: string
}
