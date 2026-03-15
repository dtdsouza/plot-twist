import { IsEmail, IsString, MinLength, MaxLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  readonly email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  readonly password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  readonly displayName!: string;
}
