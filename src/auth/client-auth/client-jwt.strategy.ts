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
    if (payload.type === 'access') {
      const session = await this.prisma.user_sessions.findFirst({
        where: {
          id: payload.sid,
          is_active: true,
          expires_at: { gt: new Date() },
        },
        include: { client_user: true },
      });

      if (!session) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new UnauthorizedException('Session not found or expired');
      }

      return {
        clientId: session.client_user.client_id,
        sessionId: session.id,
        email: session.client_user.email,
        full_name: session.client_user.full_name,
        phone: session.client_user.phone,
        detailed_address: session.client_user.detailed_address,
        province: session.client_user.province,
        district: session.client_user.district,
        ward: session.client_user.ward,
      };
    } else if (payload.type === 'client') {
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
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new UnauthorizedException('Invalid token type');
    }
  }
}
