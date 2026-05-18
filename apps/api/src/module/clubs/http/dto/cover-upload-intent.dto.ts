import { IsInt, IsString, Max, Min } from 'class-validator'

export class CoverUploadIntentDto {
  @IsString()
  readonly contentType!: string

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  readonly contentLength!: number
}
