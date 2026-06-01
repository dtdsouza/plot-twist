import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail } from 'class-validator'

export class EmailInviteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  readonly emails!: string[]
}
