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

    // Sửa từ findUnique thành findFirst vì đang filter theo nhiều field
    const clientUser = await this.prisma.client_user.findFirst({
      where: {
        id: payload.sub,
        is_active: true,
      },
    });

    if (!clientUser) {
      throw new UnauthorizedException('Client user not found');
    }

    return {
      userId: clientUser.id,
      email: clientUser.email,
      phone: clientUser.phone,
      fullName: clientUser.full_name,
    };
  }
}
