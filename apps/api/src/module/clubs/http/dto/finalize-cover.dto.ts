import { IsString } from 'class-validator'

export class FinalizeCoverDto {
  @IsString()
  readonly key!: string
}
