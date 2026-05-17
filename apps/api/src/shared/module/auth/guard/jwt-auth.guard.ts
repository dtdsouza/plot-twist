import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { IJwtPayload } from '../interface/jwt-payload.interface'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = this.extractBearerToken(request.headers?.authorization)

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization header')
    }

    try {
      const payload = await this.jwtService.verifyAsync<IJwtPayload>(token)
      request.user = payload
      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }

  private extractBearerToken(header: unknown): string | null {
    if (typeof header !== 'string') return null
    const [scheme, value] = header.split(' ')
    if (scheme !== 'Bearer' || !value) return null
    return value
  }
}
