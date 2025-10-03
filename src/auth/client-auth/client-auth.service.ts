import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientUserService } from '../../client_user/client_user.service';
import { KiotVietService } from '../../kiotviet/kiotviet.service';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { ClientRegisterDto } from './dto/client-register.dto';
import { ClientLoginDto } from './dto/client-login.dto';

@Injectable()
export class ClientAuthService {
  private transporter: nodemailer.Transporter;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private clientUserService: ClientUserService,
    private kiotVietService: KiotVietService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('MAIL_HOST'),
      port: this.configService.get('MAIL_PORT'),
      secure: false,
      auth: {
        user: this.configService.get('MAIL_USER'),
        pass: this.configService.get('MAIL_PASSWORD'),
      },
    });
  }

  private generateAccessToken(payload: any): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get('APP_SECRET_KEY'),
      expiresIn: this.configService.get('TOKEN_EXPIRES_IN'),
    });
  }

  generateRefreshToken(payload: any): string {
    return this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        secret: this.configService.get('APP_SECRET_KEY'),
        expiresIn: '30d',
      },
    );
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
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

    const verificationCode = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const hashedPassword = await bcrypt.hash(registerDto.pass_word, 10);

    await this.prisma.client_user.create({
      data: {
        full_name: registerDto.full_name,
        email: registerDto.email,
        phone: registerDto.phone,
        pass_word: hashedPassword,
        verification_code: verificationCode,
        verification_code_expires: expiresAt,
        is_verified: false,
      },
    });

    await this.transporter.sendMail({
      from: this.configService.get('MAIL_FROM'),
      to: registerDto.email,
      subject: 'Mã xác thực đăng ký tài khoản - Diệp Trà',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #065FD4;">Xác thực tài khoản Diệp Trà</h2>
          <p>Xin chào <strong>${registerDto.full_name}</strong>,</p>
          <p>Mã xác thực của bạn là:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #065FD4;">
            ${verificationCode}
          </div>
          <p style="color: #666;">Mã có hiệu lực trong <strong>10 phút</strong>.</p>
          <p>Trân trọng,<br>Đội ngũ Diệp Trà</p>
        </div>
      `,
    });

    return {
      message: 'Verification code sent to your email',
      email: registerDto.email,
    };
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.client_user.findFirst({
      where: { email, is_verified: false },
    });

    if (!user) {
      throw new BadRequestException('Invalid email or already verified');
    }

    if (!user.verification_code || !user.verification_code_expires) {
      throw new BadRequestException('No verification code found');
    }

    if (new Date() > user.verification_code_expires) {
      throw new BadRequestException('Verification code expired');
    }

    if (user.verification_code !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.client_user.update({
      where: { client_id: user.client_id },
      data: {
        is_verified: true,
        verification_code: null,
        verification_code_expires: null,
      },
    });

    try {
      const kiotCustomer = await this.kiotVietService.createCustomer({
        name: user.full_name || 'Unknown User',
        phone: user.phone || '',
        email: user.email || undefined,
        address: user.detailed_address || '',
        province: user.province || '',
        district: user.district || '',
        ward: user.ward || '',
      });

      await this.prisma.client_user.update({
        where: { client_id: user.client_id },
        data: {
          kiotviet_customer_id: kiotCustomer.id,
          kiot_code: kiotCustomer.code,
        },
      });
    } catch (error) {
      console.error('Failed to create Kiot customer:', error.message);
    }

    const payload = {
      sub: Number(user.client_id),
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
      client_id: Number(user.client_id),
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
    };

    return {
      message: 'Email verified successfully',
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

    if (!user.is_verified) {
      throw new UnauthorizedException(
        'Email not verified. Please verify your email first',
      );
    }

    const payload = {
      sub: Number(user.client_id),
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
      client_id: Number(user.client_id),
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
    };

    return {
      message: 'Login successful',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: userResponse,
    };
  }

  async refreshTokenFromCookie(refreshToken: string) {
    try {
      const secretKey = this.configService.get<string>('APP_SECRET_KEY');
      const decoded = this.jwtService.verify(refreshToken, {
        secret: secretKey,
      });

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.client_user.findUnique({
        where: { client_id: decoded.sub },
      });

      if (!user || !user.refresh_token) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isValid = await bcrypt.compare(refreshToken, user.refresh_token);
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const payload = {
        sub: Number(user.client_id),
        email: user.email,
        type: 'client',
      };

      const newAccessToken = this.generateAccessToken(payload);

      return {
        access_token: newAccessToken,
        user: {
          client_id: Number(user.client_id),
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(clientId: number) {
    await this.prisma.client_user.update({
      where: { client_id: clientId },
      data: { refresh_token: null },
    });
    return { message: 'Logout successful' };
  }
}
