import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { ClientLoginDto } from './dto/login.dto';

@Injectable()
export class ClientAuthService {
  prisma = new PrismaClient();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private generateClientId(): string {
    return (
      'CL' + Date.now().toString(36) + Math.random().toString(36).substr(2)
    );
  }

  private generateVerificationCode(): string {
    return Math.random().toString().substr(2, 6);
  }

  async register(registerDto: RegisterDto) {
    const { email, phone, password, full_name, registration_method } =
      registerDto;

    // Check existing user
    const existingUser = await this.prisma.client_user.findFirst({
      where: {
        OR: [{ email }, ...(phone ? [{ phone }] : [])],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this email or phone already exists',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const clientId = this.generateClientId();

    const clientUser = await this.prisma.client_user.create({
      data: {
        id: clientId,
        email,
        phone,
        password: hashedPassword,
        full_name,
        registration_method,
        is_active: true,
        is_email_verified: false,
        is_phone_verified: phone ? false : true,
      },
    });

    // Generate email verification code
    const emailCode = this.generateVerificationCode();
    await this.prisma.client_user_verification_code.create({
      data: {
        client_user_id: clientId,
        code: emailCode,
        type: 'email_verification',
        expire_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Send verification email (implement email service)
    // await this.sendVerificationEmail(email, emailCode);

    return {
      success: true,
      message:
        'Registration successful. Please check your email for verification code.',
      user_id: clientId,
    };
  }

  async login(loginDto: ClientLoginDto) {
    const { identifier, password } = loginDto;

    const clientUser = await this.prisma.client_user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
        is_active: true,
      },
    });

    if (!clientUser) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!clientUser.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, clientUser.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.client_user.update({
      where: { id: clientUser.id },
      data: { last_login_date: new Date() },
    });

    const token = await this.jwtService.signAsync(
      {
        sub: clientUser.id,
        email: clientUser.email,
        type: 'client',
      },
      {
        expiresIn: this.configService.get<string>('TOKEN_EXPIRES_IN') || '7d',
        secret: this.configService.get<string>('APP_SECRET_KEY'),
      },
    );

    return {
      success: true,
      token,
      user: {
        id: clientUser.id,
        email: clientUser.email,
        phone: clientUser.phone,
        full_name: clientUser.full_name,
        is_email_verified: clientUser.is_email_verified,
        is_phone_verified: clientUser.is_phone_verified,
      },
    };
  }

  async verifyEmail(userId: string, code: string) {
    const verification =
      await this.prisma.client_user_verification_code.findFirst({
        where: {
          client_user_id: userId,
          code,
          type: 'email_verification',
          is_used: false,
          expire_date: { gte: new Date() },
        },
      });

    if (!verification) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    await this.prisma.$transaction([
      this.prisma.client_user.update({
        where: { id: userId },
        data: { is_email_verified: true },
      }),
      this.prisma.client_user_verification_code.update({
        where: { id: verification.id },
        data: { is_used: true },
      }),
    ]);

    return { success: true, message: 'Email verified successfully' };
  }
}
