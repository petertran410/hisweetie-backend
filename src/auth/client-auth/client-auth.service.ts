import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClientUserService } from '../../client_user/client_user.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientRegisterDto } from './dto/client-register.dto';
import { ClientLoginDto } from './dto/client-login.dto';
import { client_user } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ClientAuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private clientUserService: ClientUserService,
    private prisma: PrismaService,
  ) {}

  private generateAccessToken(payload: any): string {
    const secretKey = this.configService.get<string>('APP_SECRET_KEY');
    const accessTokenExpiry =
      this.configService.get<string>('TOKEN_EXPIRES_IN') || '7d';

    if (!secretKey) {
      throw new Error('APP_SECRET_KEY is not defined in environment variables');
    }

    return this.jwtService.sign(payload, {
      expiresIn: accessTokenExpiry,
      secret: secretKey,
    });
  }

  private generateRefreshToken(payload: any): string {
    const secretKey = this.configService.get<string>('APP_SECRET_KEY');
    const refreshTokenExpiry = '30d';

    if (!secretKey) {
      throw new Error('APP_SECRET_KEY is not defined in environment variables');
    }

    return this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        expiresIn: refreshTokenExpiry,
        secret: secretKey,
      },
    );
  }

  private async validateRefreshToken(token: string): Promise<any> {
    try {
      const secretKey = this.configService.get<string>('APP_SECRET_KEY');
      const decoded = this.jwtService.verify(token, { secret: secretKey });

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async register(registerDto: ClientRegisterDto) {
    const existingUser = await this.clientUserService.checkExistence({
      email: registerDto.email,
      phone: registerDto.phone,
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this email or phone already exists',
      );
    }

    const newUser = await this.clientUserService.create(registerDto);

    const payload = {
      sub: Number(newUser.client_id),
      email: newUser.email,
      type: 'client',
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.prisma.client_user.update({
      where: { client_id: newUser.client_id },
      data: { refresh_token: hashedRefreshToken },
    });

    const userResponse = {
      client_id: Number(newUser.client_id),
      full_name: newUser.full_name,
      email: newUser.email,
      phone: newUser.phone,
      avatar: newUser.avatar,
      face_app_id: newUser.face_app_id,
      role: newUser.role,
    };

    return {
      message: 'Registration successful - auto logged in',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: userResponse,
    };
  }

  async login(loginDto: ClientLoginDto) {
    const user = await this.clientUserService.validate(
      loginDto.email,
      loginDto.pass_word,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = {
      sub: Number(user.client_id), // Convert BigInt to Number
      email: user.email,
      type: 'client',
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.prisma.client_user.update({
      where: { client_id: user.client_id },
      data: { refresh_token: hashedRefreshToken },
    });

    const userResponse = {
      client_id: Number(user.client_id), // Convert BigInt to Number
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      face_app_id: user.face_app_id,
      role: user.role,
    };

    return {
      message: 'Login successful',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: userResponse,
    };
  }

  async refreshTokenFromCookie(refreshToken: string) {
    const decoded = await this.validateRefreshToken(refreshToken);

    const users = await this.prisma.client_user.findMany({
      where: { client_id: Number(decoded.sub) },
    });

    if (users.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const user = users[0];

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    if (!user.refresh_token) {
      throw new UnauthorizedException('No refresh token found');
    }

    const isValidRefreshToken = await bcrypt.compare(
      refreshToken,
      user.refresh_token,
    );

    if (!isValidRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const payload = {
      sub: Number(user.client_id),
      email: user.email,
      type: 'client',
    };

    const newAccessToken = this.generateAccessToken(payload);
    const newRefreshToken = this.generateRefreshToken(payload);

    const hashedNewRefreshToken = await bcrypt.hash(newRefreshToken, 10);

    await this.prisma.client_user.update({
      where: { client_id: user.client_id },
      data: { refresh_token: hashedNewRefreshToken },
    });

    const userResponse = {
      client_id: Number(user.client_id), // Convert BigInt to Number
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      face_app_id: user.face_app_id,
      role: user.role,
    };

    return {
      message: 'Token refreshed successfully',
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      user: userResponse,
    };
  }

  async logout(clientId: number) {
    await this.prisma.client_user.update({
      where: { client_id: clientId },
      data: { refresh_token: null },
    });

    return {
      message: 'Logout successful',
    };
  }
}
