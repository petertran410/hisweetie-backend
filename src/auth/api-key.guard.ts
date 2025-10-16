import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['authorization'];

    if (!apiKey) {
      throw new UnauthorizedException('API Key is required');
    }

    const validApiKey =
      this.configService.get('PUBLIC_API_KEY') || 'Dieptra@123';

    if (apiKey !== validApiKey && apiKey !== `Bearer ${validApiKey}`) {
      throw new UnauthorizedException('Invalid API Key');
    }

    return true;
  }
}
