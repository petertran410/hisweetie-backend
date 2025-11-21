import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClientJwtStrategy extends PassportStrategy(
  Strategy,
  'client-jwt',
) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
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
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.client_user.findUnique({
      where: { client_id: payload.sub },
    });

    if (!user) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new UnauthorizedException('User not found');
    }

    return {
      clientId: user.client_id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      detailed_address: user.detailed_address,
      province: user.province,
      district: user.district,
      ward: user.ward,
    };
  }
}
