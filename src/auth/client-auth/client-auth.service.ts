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
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
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

interface PendingOAuthUser {
  provider: string;
  providerId: string;
  email: string;
  full_name: string;
  avatar_url: string;
  expiresAt: Date;
}

@Injectable()
export class ClientAuthService {
  private transporter: nodemailer.Transporter;
  private pendingRegistrations = new Map<string, PendingRegistration>();
  private pendingOAuthUsers = new Map<string, PendingOAuthUser>();

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
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000); // Clean every hour
  }

  private cleanupExpiredRegistrations() {
    const now = new Date();
    for (const [email, data] of this.pendingRegistrations.entries()) {
      if (now > data.expiresAt) {
        this.pendingRegistrations.delete(email);
      }
    }
  }

  private async cleanupExpiredSessions() {
    await this.prisma.user_sessions.deleteMany({
      where: {
        expires_at: { lt: new Date() },
      },
    });
  }

  // Generate session-based tokens (secure approach)
  public generateAccessToken(sessionId: string, clientId: number): string {
    const secretKey = this.configService.get<string>('APP_SECRET_KEY');
    return this.jwtService.sign(
      {
        sid: sessionId, // session ID instead of sensitive data
        sub: clientId, // minimal identifier
        type: 'access', // token type
      },
      { secret: secretKey, expiresIn: '15m' },
    );
  }

  public generateRefreshToken(sessionId: string): string {
    const secretKey = this.configService.get<string>('APP_SECRET_KEY');
    return this.jwtService.sign(
      {
        sid: sessionId,
        type: 'refresh',
      },
      { secret: secretKey, expiresIn: '7d' },
    );
  }

  public generateLegacyAccessToken(payload: any): string {
    // For OAuth temp tokens only
    const secretKey = this.configService.get<string>('APP_SECRET_KEY');
    return this.jwtService.sign(
      { ...payload, type: 'client' },
      { secret: secretKey, expiresIn: '30m' },
    );
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private getDeviceInfo(userAgent?: string) {
    if (!userAgent) return 'Unknown Device';
    return userAgent.substring(0, 500);
  }

  // Create secure session
  private async createSession(
    clientId: number,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const sessionId = uuidv4();
    const refreshToken = this.generateRefreshToken(sessionId);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);

    const session = await this.prisma.user_sessions.create({
      data: {
        id: sessionId,
        client_id: clientId,
        refresh_token_hash: hashedRefreshToken,
        device_info: this.getDeviceInfo(userAgent),
        ip_address: ipAddress,
        user_agent: userAgent,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        is_active: true,
        last_used_at: new Date(),
      },
    });

    return {
      sessionId: session.id,
      refreshToken,
      accessToken: this.generateAccessToken(sessionId, clientId),
    };
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
    const hashedPassword = await bcrypt.hash(registerDto.pass_word, 12);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

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
      subject: 'Xác thực tài khoản - Diệp Trà',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #065FD4;">Chào mừng đến với Diệp Trà!</h2>
        <p>Xin chào <strong>${registerDto.full_name}</strong>,</p>
        <p>Cảm ơn bạn đã đăng ký tài khoản. Mã xác thực của bạn là:</p>
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

  async verifyEmail(
    email: string,
    code: string,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const pendingData = this.pendingRegistrations.get(email);

    if (!pendingData) {
      throw new BadRequestException('Verification request not found');
    }

    if (new Date() > pendingData.expiresAt) {
      this.pendingRegistrations.delete(email);
      throw new BadRequestException('Verification code expired');
    }

    if (pendingData.verificationCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    const kiotCheck = await this.kiotVietService.checkCustomerExistsByPhone(
      pendingData.phone,
    );

    if (kiotCheck.exists) {
      this.pendingRegistrations.delete(email);
      throw new ConflictException(
        'Phone number is already registered in the system',
      );
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

      await this.prisma.client_user.delete({
        where: { client_id: user.client_id },
      });

      throw new BadRequestException(
        'Unable to create customer. Please try again or contact support.',
      );
    }

    const tokens = await this.createSession(
      user.client_id,
      deviceInfo,
      ipAddress,
      userAgent,
    );

    return {
      message: 'Email verified successfully',
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      user: {
        client_id: user.client_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
      },
    };
  }

  async login(
    loginDto: ClientLoginDto,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.clientUserService.validate(
      loginDto.emailOrPhone,
      loginDto.pass_word,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }

    if (!user.is_verified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    // Optional: Deactivate old sessions for single-device login
    // await this.prisma.user_sessions.updateMany({
    //   where: {
    //     client_id: user.client_id,
    //     is_active: true
    //   },
    //   data: { is_active: false }
    // });

    const tokens = await this.createSession(
      user.client_id,
      deviceInfo,
      ipAddress,
      userAgent,
    );

    return {
      message: 'Login successful',
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      user: {
        client_id: user.client_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
      },
    };
  }

  async refreshTokenFromCookie(refreshToken: string, ipAddress?: string) {
    try {
      const secretKey = this.configService.get<string>('APP_SECRET_KEY');
      const decoded = this.jwtService.verify(refreshToken, {
        secret: secretKey,
      });

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Find session by ID
      const session = await this.prisma.user_sessions.findFirst({
        where: {
          id: decoded.sid,
          is_active: true,
          expires_at: { gt: new Date() },
        },
        include: { client_user: true },
      });

      if (!session) {
        throw new UnauthorizedException('Session not found or expired');
      }

      // Verify refresh token hash
      const isValid = await bcrypt.compare(
        refreshToken,
        session.refresh_token_hash,
      );
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Update session last used time and IP if provided
      await this.prisma.user_sessions.update({
        where: { id: session.id },
        data: {
          last_used_at: new Date(),
          ip_address: ipAddress || session.ip_address,
        },
      });

      // Generate new access token
      const newAccessToken = this.generateAccessToken(
        session.id,
        session.client_id,
      );

      return {
        access_token: newAccessToken,
        user: {
          client_id: session.client_user.client_id,
          full_name: session.client_user.full_name,
          email: session.client_user.email,
          phone: session.client_user.phone,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(sessionId: string) {
    try {
      await this.prisma.user_sessions.update({
        where: { id: sessionId },
        data: { is_active: false },
      });

      return { message: 'Logout successful' };
    } catch (error) {
      return { message: 'Logout completed' }; // Even if session not found, return success
    }
  }

  async logoutAllSessions(clientId: number) {
    await this.prisma.user_sessions.updateMany({
      where: {
        client_id: clientId,
        is_active: true,
      },
      data: { is_active: false },
    });

    return { message: 'All sessions logged out successfully' };
  }

  async forgotPasswordRequest(email: string) {
    const user = await this.prisma.client_user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Email does not exist in the system');
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
      subject: 'Password Reset Verification Code - Diệp Trà',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #065FD4;">Password Reset - Diệp Trà</h2>
        <p>Hello <strong>${user.full_name}</strong>,</p>
        <p>You have requested to reset your password. Your verification code is:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #065FD4;">
          ${verificationCode}
        </div>
        <p style="color: #666;">The code is valid for <strong>10 minutes</strong>.</p>
        <p style="color: #999; font-size: 14px;">If you did not request a password reset, please ignore this email.</p>
        <p>Best regards,<br>Diệp Trà Team</p>
      </div>
    `,
    });

    return {
      message: 'Verification code has been sent to your email',
      email,
    };
  }

  async verifyForgotPasswordOtp(email: string, code: string) {
    const pendingData = this.pendingRegistrations.get(email);

    if (!pendingData) {
      throw new BadRequestException('Password reset request not found');
    }

    if (new Date() > pendingData.expiresAt) {
      this.pendingRegistrations.delete(email);
      throw new BadRequestException('Verification code has expired');
    }

    if (pendingData.verificationCode !== code) {
      throw new BadRequestException('Verification code is incorrect');
    }

    return {
      message: 'Verification code is valid',
      email,
    };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const pendingData = this.pendingRegistrations.get(email);

    if (!pendingData) {
      throw new BadRequestException('Password reset request not found');
    }

    if (new Date() > pendingData.expiresAt) {
      this.pendingRegistrations.delete(email);
      throw new BadRequestException('Verification code has expired');
    }

    if (pendingData.verificationCode !== code) {
      throw new BadRequestException('Verification code is incorrect');
    }

    const user = await this.prisma.client_user.findUnique({
      where: { email },
    });

    if (user && user.pass_word) {
      const isSamePassword = await bcrypt.compare(newPassword, user.pass_word);
      if (isSamePassword) {
        throw new BadRequestException(
          'New password cannot be the same as the old password',
        );
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.prisma.client_user.update({
      where: { email },
      data: { pass_word: hashedPassword },
    });

    // Invalidate all sessions for this user
    if (user) {
      await this.logoutAllSessions(user.client_id);
    }

    this.pendingRegistrations.delete(email);

    return {
      message: 'Password has been reset successfully',
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

    if (user && user.phone) {
      const tokens = await this.createSession(user.client_id);

      return {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        needs_phone: false,
        user: {
          client_id: user.client_id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          avatar_url: user.avatar_url,
        },
      };
    }

    const tempKey = `${oauthData.provider}_${oauthData.providerId}`;

    this.pendingOAuthUsers.set(tempKey, {
      provider: oauthData.provider,
      providerId: oauthData.providerId,
      email: oauthData.email,
      full_name: oauthData.full_name,
      avatar_url: oauthData.avatar_url,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const tempPayload = {
      tempKey: tempKey,
      email: oauthData.email,
      type: 'oauth_temp',
    };

    const tempToken = this.generateLegacyAccessToken(tempPayload);

    return {
      access_token: tempToken,
      refresh_token: null,
      needs_phone: true,
      is_temp: true,
      user: {
        client_id: null,
        full_name: oauthData.full_name,
        email: oauthData.email,
        phone: null,
        avatar_url: oauthData.avatar_url,
      },
    };
  }

  async completeOAuthRegistration(tempKey: string, phone: string) {
    const pendingOAuth = this.pendingOAuthUsers.get(tempKey);

    if (!pendingOAuth) {
      throw new BadRequestException(
        'Login session has expired. Please login again.',
      );
    }

    if (new Date() > pendingOAuth.expiresAt) {
      this.pendingOAuthUsers.delete(tempKey);
      throw new BadRequestException(
        'Login session has expired. Please login again.',
      );
    }

    const existingPhone = await this.prisma.client_user.findUnique({
      where: { phone },
    });

    if (existingPhone) {
      this.pendingOAuthUsers.delete(tempKey);
      throw new ConflictException('Phone number is already registered');
    }

    const user = await this.prisma.client_user.create({
      data: {
        full_name: pendingOAuth.full_name,
        email: pendingOAuth.email,
        phone: phone,
        oauth_provider: pendingOAuth.provider,
        oauth_provider_id: pendingOAuth.providerId,
        avatar_url: pendingOAuth.avatar_url,
        is_verified: true,
      },
    });

    try {
      const kiotCustomer = await this.kiotVietService.createCustomer({
        name: user.full_name || 'Unknown User',
        phone: user.phone || '',
        email: user.email || undefined,
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

    this.pendingOAuthUsers.delete(tempKey);

    const tokens = await this.createSession(user.client_id);

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      user: {
        client_id: user.client_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
      },
    };
  }

  // Get user sessions for management
  async getUserSessions(clientId: number) {
    const sessions = await this.prisma.user_sessions.findMany({
      where: {
        client_id: clientId,
        is_active: true,
        expires_at: { gt: new Date() },
      },
      select: {
        id: true,
        device_info: true,
        ip_address: true,
        created_at: true,
        last_used_at: true,
        expires_at: true,
      },
      orderBy: { last_used_at: 'desc' },
    });

    return sessions;
  }

  // Revoke specific session
  async revokeSession(sessionId: string, clientId: number) {
    const session = await this.prisma.user_sessions.findFirst({
      where: {
        id: sessionId,
        client_id: clientId,
        is_active: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.user_sessions.update({
      where: { id: sessionId },
      data: { is_active: false },
    });

    return { message: 'Session revoked successfully' };
  }
}
