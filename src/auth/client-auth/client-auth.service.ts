import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
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

interface PendingRegistration {
  full_name: string;
  email: string;
  phone: string;
  hashedPassword: string;
  verificationCode: string;
  expiresAt: Date;
}

@Injectable()
export class ClientAuthService {
  private transporter: nodemailer.Transporter;
  private pendingRegistrations = new Map<string, PendingRegistration>();

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

    setInterval(() => this.cleanupExpiredRegistrations(), 5 * 60 * 1000);
  }

  private cleanupExpiredRegistrations() {
    const now = new Date();
    for (const [email, data] of this.pendingRegistrations.entries()) {
      if (now > data.expiresAt) {
        this.pendingRegistrations.delete(email);
      }
    }
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

    if (this.pendingRegistrations.has(registerDto.email)) {
      this.pendingRegistrations.delete(registerDto.email);
    }

    const verificationCode = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const hashedPassword = await bcrypt.hash(registerDto.pass_word, 10);

    this.pendingRegistrations.set(registerDto.email, {
      full_name: registerDto.full_name,
      email: registerDto.email,
      phone: registerDto.phone,
      hashedPassword,
      verificationCode,
      expiresAt,
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
    const pendingData = this.pendingRegistrations.get(email);

    if (!pendingData) {
      throw new BadRequestException(
        'No pending registration found for this email',
      );
    }

    if (new Date() > pendingData.expiresAt) {
      this.pendingRegistrations.delete(email);
      throw new BadRequestException('Verification code expired');
    }

    if (pendingData.verificationCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    const user = await this.prisma.client_user.create({
      data: {
        full_name: pendingData.full_name,
        email: pendingData.email,
        phone: pendingData.phone,
        pass_word: pendingData.hashedPassword,
        is_verified: true,
      },
    });

    this.pendingRegistrations.delete(email);

    try {
      const kiotCustomer = await this.kiotVietService.createCustomer({
        name: user.full_name || 'Unknown User',
        phone: user.phone || '',
        email: user.email || undefined,
        address: user.detailed_address || '',
        province: user.province || '',
        district: user.district || '',
        ward: user.ward || '',
        clientId: user.client_id,
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
      loginDto.emailOrPhone,
      loginDto.pass_word,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid email/phone or password');
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

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (!user.refresh_token) {
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

  async forgotPasswordRequest(email: string) {
    const user = await this.prisma.client_user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Email không tồn tại trong hệ thống');
    }

    if (this.pendingRegistrations.has(email)) {
      this.pendingRegistrations.delete(email);
    }

    const verificationCode = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    this.pendingRegistrations.set(email, {
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      hashedPassword: '',
      verificationCode,
      expiresAt,
    });

    await this.transporter.sendMail({
      from: this.configService.get('MAIL_FROM'),
      to: email,
      subject: 'Mã xác thực đặt lại mật khẩu - Diệp Trà',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #065FD4;">Đặt lại mật khẩu - Diệp Trà</h2>
        <p>Xin chào <strong>${user.full_name}</strong>,</p>
        <p>Bạn đã yêu cầu đặt lại mật khẩu. Mã xác thực của bạn là:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #065FD4;">
          ${verificationCode}
        </div>
        <p style="color: #666;">Mã có hiệu lực trong <strong>10 phút</strong>.</p>
        <p style="color: #999; font-size: 14px;">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
        <p>Trân trọng,<br>Đội ngũ Diệp Trà</p>
      </div>
    `,
    });

    return {
      message: 'Mã xác thực đã được gửi đến email của bạn',
      email,
    };
  }

  async verifyForgotPasswordOtp(email: string, code: string) {
    const pendingData = this.pendingRegistrations.get(email);

    if (!pendingData) {
      throw new BadRequestException('Không tìm thấy yêu cầu đặt lại mật khẩu');
    }

    if (new Date() > pendingData.expiresAt) {
      this.pendingRegistrations.delete(email);
      throw new BadRequestException('Mã xác thực đã hết hạn');
    }

    if (pendingData.verificationCode !== code) {
      throw new BadRequestException('Mã xác thực không đúng');
    }

    return {
      message: 'Mã xác thực hợp lệ',
      email,
    };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const pendingData = this.pendingRegistrations.get(email);

    if (!pendingData) {
      throw new BadRequestException('Không tìm thấy yêu cầu đặt lại mật khẩu');
    }

    if (new Date() > pendingData.expiresAt) {
      this.pendingRegistrations.delete(email);
      throw new BadRequestException('Mã xác thực đã hết hạn');
    }

    if (pendingData.verificationCode !== code) {
      throw new BadRequestException('Mã xác thực không đúng');
    }

    const user = await this.prisma.client_user.findUnique({
      where: { email },
    });

    if (user && user.pass_word) {
      const isSamePassword = await bcrypt.compare(newPassword, user.pass_word);
      if (isSamePassword) {
        throw new BadRequestException(
          'Mật khẩu mới không được trùng với mật khẩu cũ',
        );
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.client_user.update({
      where: { email },
      data: { pass_word: hashedPassword },
    });

    this.pendingRegistrations.delete(email);

    return {
      message: 'Mật khẩu đã được đặt lại thành công',
    };
  }

  async findOrCreateOAuthUser(oauthData: {
    provider: string;
    providerId: string;
    email: string;
    full_name: string;
    avatar_url: string;
  }) {
    let user = await this.prisma.client_user.findFirst({
      where: {
        oauth_provider: oauthData.provider,
        oauth_provider_id: oauthData.providerId,
      },
    });

    if (!user && oauthData.email) {
      user = await this.prisma.client_user.findUnique({
        where: { email: oauthData.email },
      });

      if (user && !user.oauth_provider) {
        user = await this.prisma.client_user.update({
          where: { client_id: user.client_id },
          data: {
            oauth_provider: oauthData.provider,
            oauth_provider_id: oauthData.providerId,
            avatar_url: oauthData.avatar_url,
          },
        });
      }
    }

    if (!user) {
      user = await this.prisma.client_user.create({
        data: {
          email: oauthData.email,
          full_name: oauthData.full_name,
          oauth_provider: oauthData.provider,
          oauth_provider_id: oauthData.providerId,
          avatar_url: oauthData.avatar_url,
          is_verified: true,
        },
      });

      if (user.email) {
        try {
          const kiotCustomer = await this.kiotVietService.createCustomer({
            name: user.full_name || '',
            phone: user.phone || '',
            email: user.email,
            clientId: user.client_id,
          });

          await this.prisma.client_user.update({
            where: { client_id: user.client_id },
            data: {
              kiotviet_customer_id: kiotCustomer.id,
              kiot_code: kiotCustomer.code,
            },
          });
        } catch (error) {
          console.error('Failed to create KiotViet customer:', error);
        }
      }
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

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        client_id: Number(user.client_id),
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
      },
    };
  }
}
