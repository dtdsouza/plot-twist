import { IsOptional, IsString, Length, MaxLength } from 'class-validator'

export class CreateClubDto {
  @IsString()
  @Length(1, 100)
  readonly name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly description?: string
}
