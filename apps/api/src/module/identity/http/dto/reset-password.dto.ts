import { IsString, IsNotEmpty, MinLength, MaxLength } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  readonly token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  readonly password!: string;
}
