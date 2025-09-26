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
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class ClientAuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private clientUserService: ClientUserService,
    private prisma: PrismaService,
  ) {}

  private generateTokens(payload: any) {
    const secretKey = this.configService.get<string>('APP_SECRET_KEY');
    const accessTokenExpiry =
      this.configService.get<string>('TOKEN_EXPIRES_IN') || '7d';
    const refreshTokenExpiry = '30d'; // Refresh token lasts 30 days

    if (!secretKey) {
      throw new Error('APP_SECRET_KEY is not defined in environment variables');
    }

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessTokenExpiry,
      secret: secretKey,
    });

    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        expiresIn: refreshTokenExpiry,
        secret: secretKey,
      },
    );

    return { accessToken, refreshToken };
  }

  private async validateRefreshToken(token: string): Promise<any> {
    try {
      const secretKey = this.configService.get<string>('APP_SECRET_KEY');
      const decoded = this.jwtService.verify(token, { secret: secretKey });

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp - now < 86400) {
        throw new UnauthorizedException(
          'Refresh token expires soon, please login again',
        );
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Refresh token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid refresh token format');
      }
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

    const { pass_word, refresh_token, ...userResponse } = newUser;
    return {
      message: 'Registration successful',
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

    // Check if user has existing valid refresh token
    if (user.refresh_token) {
      try {
        const decoded = await this.validateRefreshToken(user.refresh_token);

        // If refresh token is still valid, generate new access token but keep refresh token
        const payload = {
          sub: user.client_id,
          email: user.email,
          type: 'client',
        };

        const secretKey = this.configService.get<string>('APP_SECRET_KEY');
        const accessTokenExpiry =
          this.configService.get<string>('TOKEN_EXPIRES_IN') || '7d';

        const newAccessToken = this.jwtService.sign(payload, {
          expiresIn: accessTokenExpiry,
          secret: secretKey,
        });

        const { pass_word, refresh_token, ...userResponse } = user;
        return {
          message: 'Login successful - existing session',
          access_token: newAccessToken,
          refresh_token: user.refresh_token,
          user: userResponse,
        };
      } catch (error) {
        // Refresh token is expired or invalid, continue with normal flow
      }
    }

    // Generate new tokens
    const payload = {
      sub: user.client_id,
      email: user.email,
      type: 'client',
    };

    const { accessToken, refreshToken } = this.generateTokens(payload);

    // Save refresh token to database
    await this.prisma.client_user.update({
      where: { client_id: user.client_id },
      data: { refresh_token: refreshToken },
    });

    const {
      pass_word,
      refresh_token: old_refresh_token,
      ...userResponse
    } = user;
    return {
      message: 'Login successful - new session',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: userResponse,
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const decoded = await this.validateRefreshToken(
      refreshTokenDto.refresh_token,
    );

    // Find user with this refresh token
    const user = await this.prisma.client_user.findFirst({
      where: {
        client_id: decoded.sub,
        refresh_token: refreshTokenDto.refresh_token,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new tokens
    const payload = {
      sub: user.client_id,
      email: user.email,
      type: 'client',
    };

    const { accessToken, refreshToken } = this.generateTokens(payload);

    // Update refresh token in database
    await this.prisma.client_user.update({
      where: { client_id: user.client_id },
      data: { refresh_token: refreshToken },
    });

    const {
      pass_word,
      refresh_token: old_refresh_token,
      ...userResponse
    } = user;
    return {
      message: 'Token refreshed successfully',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: userResponse,
    };
  }

  async logout(clientId: number) {
    const user = await this.prisma.client_user.findUnique({
      where: { client_id: clientId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.client_user.update({
      where: { client_id: clientId },
      data: { refresh_token: null },
    });

    return {
      message: 'Logout successful',
    };
  }

  async checkTokenStatus(refreshToken: string) {
    try {
      const decoded = await this.validateRefreshToken(refreshToken);
      const user = await this.prisma.client_user.findFirst({
        where: {
          client_id: decoded.sub,
          refresh_token: refreshToken,
        },
      });

      if (!user) {
        return { valid: false, reason: 'Token not found in database' };
      }

      const now = Math.floor(Date.now() / 1000);
      const timeLeft = decoded.exp - now;

      return {
        valid: true,
        expiresIn: timeLeft,
        expiresAt: new Date(decoded.exp * 1000),
      };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }
}
