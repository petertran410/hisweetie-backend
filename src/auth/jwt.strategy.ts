import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private prisma = new PrismaClient();

  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('APP_SECRET_KEY'),
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
