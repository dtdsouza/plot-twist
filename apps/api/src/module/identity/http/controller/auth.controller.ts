import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from '../../core/auth.service'
import { RegisterDto } from '../dto/register.dto'
import { LoginDto } from '../dto/login.dto'
import { ForgotPasswordDto } from '../dto/forgot-password.dto'
import { ResetPasswordDto } from '../dto/reset-password.dto'
import { IAuthResponse } from '../dto/auth-response.interface'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
