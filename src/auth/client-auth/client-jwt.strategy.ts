import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ClientJwtStrategy extends PassportStrategy(
  Strategy,
  'client-jwt',
) {
  private prisma = new PrismaClient();

  constructor(private configService: ConfigService) {
    const secretKey = configService.get<string>('APP_SECRET_KEY');

    if (!secretKey) {
      throw new Error('APP_SECRET_KEY is not defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secretKey,
    });
  }

  async validate(payload: any) {
    if (payload.type !== 'client') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.client_user.findUnique({
      where: { client_id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      clientId: user.client_id,
      email: user.email,
      phone: user.phone,
      fullName: user.full_name,
      avatar: user.avatar,
    };
  }
}
