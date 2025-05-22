import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { LoginDTO } from './dto/login-auth.dto';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  prisma = new PrismaClient();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(login: LoginDTO): Promise<{ token: string }> {
    const user = await this.prisma.user.findFirst({
      where: {
        phone: login.phone,
      },
      include: {
        authority: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      login.password,
      user.password!,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const roles = user.authority.map((auth) => auth.role).join(',');
    const secretKey = this.configService.get<string>('APP_SECRET_KEY');
    const expiresIn =
      this.configService.get<string>('TOKEN_EXPIRES_IN') || '1d';

    if (!secretKey) {
      throw new Error('APP_SECRET_KEY is not defined in environment variables');
    }

    const token = await this.jwtService.signAsync(
      {
        sub: user.id, // Keep the subject claim
        roles: roles,
      },
      {
        expiresIn: expiresIn,
        secret: secretKey,
      },
    );

    return { token };
  }
}
