import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
    console.log('JWT Payload:', payload); // Debug log

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        authority: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    console.log('Authenticated user:', user.id); // Debug log

    return {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.full_name,
      roles: user.authority.map((auth) => auth.role),
    };
  }
}
