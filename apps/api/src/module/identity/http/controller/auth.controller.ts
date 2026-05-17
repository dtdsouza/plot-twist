import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from '../../core/auth.service'
import {
  EmailChangeService,
  type IEmailChangeVerifyResult,
} from '../../core/email-change.service'
import { RegisterDto } from '../dto/register.dto'
import { LoginDto } from '../dto/login.dto'
import { ForgotPasswordDto } from '../dto/forgot-password.dto'
import { ResetPasswordDto } from '../dto/reset-password.dto'
import { ChangePasswordDto } from '../dto/change-password.dto'
import { VerifyEmailChangeDto } from '../dto/verify-email-change.dto'
import { IAuthResponse } from '../dto/auth-response.interface'
import { JwtAuthGuard, CurrentUser, type IJwtPayload } from '@module/shared/auth'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailChangeService: EmailChangeService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<IAuthResponse> {
    return this.authService.register(dto)
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<IAuthResponse> {
    return this.authService.login(dto)
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email)

    return {
      message:
        'If an account with that email exists, we have sent a password reset link.',
    }
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.token, dto.password)

    return {
      message:
        'Password has been reset successfully. Please log in with your new password.',
    }
  }

  @Post('verify-email-change')
  @HttpCode(HttpStatus.OK)
  async verifyEmailChange(
    @Body() dto: VerifyEmailChangeDto,
  ): Promise<IEmailChangeVerifyResult> {
    return this.emailChangeService.verify(dto.token)
  }

  // Rate limiting deferred -- consider Throttle decorator here in the future
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() current: IJwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(current.sub, dto)
  }
}
