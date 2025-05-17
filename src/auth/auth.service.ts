import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { LoginDTO } from './dto/login-auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  prisma = new PrismaClient();

  constructor(private jwtService: JwtService) {}

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

    const userAuthorities = user.authority.map((auth) => ({
      role: auth.role,
    }));

    const roles = user.authority.map((auth) => auth.role).join(',');

    const token = await this.jwtService.signAsync(
      {
        sub: user.id, // Keep the subject claim
        roles: roles,
      },
      {
        expiresIn: process.env.TOKEN_EXPIRES_IN,
        secret: process.env.APP_SECRET_KEY,
      },
    );

    return { token };
  }
}
