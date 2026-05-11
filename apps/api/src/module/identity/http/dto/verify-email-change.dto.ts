import { IsNotEmpty, IsString } from 'class-validator'

export class VerifyEmailChangeDto {
  @IsString()
  @IsNotEmpty()
  readonly token!: string
}
