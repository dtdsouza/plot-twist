import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  readonly displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  readonly bio?: string;

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(500)
  readonly avatar?: string;
}
