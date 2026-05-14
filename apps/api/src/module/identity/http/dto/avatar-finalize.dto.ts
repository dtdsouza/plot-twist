import { IsString, MaxLength } from 'class-validator'

export class AvatarFinalizeDto {
  @IsString()
  @MaxLength(500)
  readonly uploadKey!: string
}
