import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Get,
  UseGuards,
  HttpException,
  Res,
  Req,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Delete,
  Param,
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ClientAuthService } from './client-auth.service';
import { ClientRegisterDto } from './dto/client-register.dto';
import { ClientLoginDto } from './dto/client-login.dto';
import { ClientJwtAuthGuard } from './client-jwt-auth.guard';
import { CurrentClient } from './current-client.decorator';
import {
  ForgotPasswordRequestDto,
  VerifyForgotPasswordOtpDto,
  ResetPasswordDto,
} from './dto/client-forgot-password.dto';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

@ApiTags('client-auth')
@Controller('client-auth')
export class ClientAuthController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  private getDeviceInfo(request: Request) {
    const userAgent = request.headers['user-agent'] || '';
    const ip =
      request.ip ||
      (request.headers['x-forwarded-for'] as string) ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress;

    return {
      userAgent,
      ipAddress: Array.isArray(ip) ? ip[0] : ip,
      deviceInfo: userAgent.substring(0, 500),
    };
  }

  private setRefreshTokenCookie(response: Response, refreshToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';

    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    const csrfToken = crypto.randomBytes(32).toString('hex');
    response.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private clearRefreshTokenCookie(response: Response) {
    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
    response.clearCookie('csrf_token', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register new client user and send verification code',
  })
  @ApiResponse({
    status: 201,
    description: 'Verification code sent to email',
  })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @UsePipes(new ValidationPipe())
  async register(@Body() registerDto: ClientRegisterDto) {
    try {
      const result = await this.clientAuthService.register(registerDto);
      return result;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new HttpException('User already exists', HttpStatus.CONFLICT);
      }
      if (error instanceof BadRequestException) {
        throw new HttpException('Invalid input data', HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(
        'Service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with code' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async verifyEmail(
    @Body() body: { email: string; code: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const deviceInfo = this.getDeviceInfo(request);

      const result = await this.clientAuthService.verifyEmail(
        body.email,
        body.code,
        deviceInfo.deviceInfo,
        deviceInfo.ipAddress,
        deviceInfo.userAgent,
      );

      this.setRefreshTokenCookie(response, result.refresh_token);
      const { refresh_token, ...responseData } = result;
      return responseData;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw new HttpException('Verification failed', HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(
        'Service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login client user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @UsePipes(new ValidationPipe())
  async login(
    @Body() loginDto: ClientLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const deviceInfo = this.getDeviceInfo(request);

      const result = await this.clientAuthService.login(
        loginDto,
        deviceInfo.deviceInfo,
        deviceInfo.ipAddress,
        deviceInfo.userAgent,
      );

      this.setRefreshTokenCookie(response, result.refresh_token);
      const { refresh_token, ...responseData } = result;
      return responseData;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException(
        'Service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using httpOnly cookie' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const refreshToken = request.cookies?.refresh_token;

      if (!refreshToken) {
        throw new UnauthorizedException('Refresh token not found in cookie');
      }

      const deviceInfo = this.getDeviceInfo(request);
      const result = await this.clientAuthService.refreshTokenFromCookie(
        refreshToken,
        deviceInfo.ipAddress,
      );

      return { access_token: result.access_token, user: result.user };
    } catch (error) {
      this.clearRefreshTokenCookie(response);

      if (error.status && error.status !== 500) {
        throw error;
      }
      throw new HttpException(
        'Token refresh failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClientJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout client user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(
    @CurrentClient() client: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.clientAuthService.logout(client.sessionId);
      this.clearRefreshTokenCookie(response);
      return result;
    } catch (error) {
      throw new HttpException(
        'Logout failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClientJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all sessions' })
  @ApiResponse({
    status: 200,
    description: 'All sessions logged out successfully',
  })
  async logoutAllSessions(@CurrentClient() client: any) {
    return this.clientAuthService.logoutAllSessions(client.clientId);
  }

  @Get('profile')
  @UseGuards(ClientJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current client user profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns current client user profile',
  })
  getProfile(@CurrentClient() client: any) {
    return {
      message: 'Profile retrieved successfully',
      user: client,
    };
  }

  @Get('sessions')
  @UseGuards(ClientJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all active sessions' })
  @ApiResponse({ status: 200, description: 'Returns all active sessions' })
  async getSessions(@CurrentClient() client: any) {
    return this.clientAuthService.getUserSessions(client.clientId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(ClientJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  async revokeSession(
    @CurrentClient() client: any,
    @Param('sessionId') sessionId: string,
  ) {
    return this.clientAuthService.revokeSession(sessionId, client.clientId);
  }

  @Get('check-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check authentication status using cookie' })
  @ApiResponse({ status: 200, description: 'Authentication status checked' })
  async checkAuth(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const refreshToken = request.cookies?.refresh_token;

      if (!refreshToken) {
        return { authenticated: false, message: 'No refresh token found' };
      }

      const deviceInfo = this.getDeviceInfo(request);
      const result = await this.clientAuthService.refreshTokenFromCookie(
        refreshToken,
        deviceInfo.ipAddress,
      );

      return {
        authenticated: true,
        access_token: result.access_token,
        user: result.user,
      };
    } catch (error) {
      this.clearRefreshTokenCookie(response);
      return { authenticated: false, message: 'Invalid refresh token' };
    }
  }

  @Post('forgot-password/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request forgot password - Send OTP to email' })
  @ApiResponse({ status: 200, description: 'OTP sent to email' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async forgotPasswordRequest(@Body() body: ForgotPasswordRequestDto) {
    try {
      const result = await this.clientAuthService.forgotPasswordRequest(
        body.email,
      );
      return result;
    } catch (error) {
      if (error.status && error.status !== 500) {
        throw error;
      }
      throw new HttpException(
        'Failed to send OTP',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('forgot-password/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP for forgot password' })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyForgotPasswordOtp(@Body() body: VerifyForgotPasswordOtpDto) {
    try {
      const result = await this.clientAuthService.verifyForgotPasswordOtp(
        body.email,
        body.code,
      );
      return result;
    } catch (error) {
      if (error.status && error.status !== 500) {
        throw error;
      }
      throw new HttpException(
        'OTP verification failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('forgot-password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with OTP' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    try {
      const result = await this.clientAuthService.resetPassword(
        body.email,
        body.code,
        body.new_password,
      );
      return result;
    } catch (error) {
      if (error.status && error.status !== 500) {
        throw error;
      }
      throw new HttpException(
        'Password reset failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.clientAuthService.findOrCreateOAuthUser(
        req.user,
      );

      if (result.refresh_token) {
        this.setRefreshTokenCookie(response, result.refresh_token);
      }

      const params = new URLSearchParams({
        token: result.access_token,
        user: JSON.stringify(result.user),
        needs_phone: result.needs_phone ? 'true' : 'false',
      });

      if (result.is_temp) {
        params.append('is_temp', 'true');
        const decoded = this.jwtService.decode(result.access_token) as any;
        if (decoded?.tempKey) {
          params.append('temp_key', decoded.tempKey);
        }
      }

      return response.redirect(
        `${this.configService.get('FRONTEND_URL')}/auth/callback?${params}`,
      );
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      return response.redirect(
        `${this.configService.get('FRONTEND_URL')}/dang-nhap?error=server_error&message=${encodeURIComponent('Server error while processing Google login')}`,
      );
    }
  }

  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  async facebookAuth() {}

  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookAuthRedirect(
    @Req() req: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.clientAuthService.findOrCreateOAuthUser(
        req.user,
      );

      if (result.refresh_token) {
        this.setRefreshTokenCookie(response, result.refresh_token);
      }

      const params = new URLSearchParams({
        token: result.access_token,
        user: JSON.stringify(result.user),
        needs_phone: result.needs_phone ? 'true' : 'false',
      });

      if (result.is_temp) {
        params.append('is_temp', 'true');
        const decoded = this.jwtService.decode(result.access_token) as any;
        if (decoded?.tempKey) {
          params.append('temp_key', decoded.tempKey);
        }
      }

      return response.redirect(
        `${this.configService.get('FRONTEND_URL')}/auth/callback?${params}`,
      );
    } catch (error) {
      console.error('Facebook OAuth callback error:', error);
      return response.redirect(
        `${this.configService.get('FRONTEND_URL')}/dang-nhap?error=server_error&message=${encodeURIComponent('Server error while processing Facebook login')}`,
      );
    }
  }

  @Post('complete-oauth-registration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete OAuth registration with phone number' })
  @ApiResponse({
    status: 200,
    description: 'OAuth registration completed successfully',
  })
  async completeOAuthRegistration(
    @Body() body: { tempKey: string; phone: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.clientAuthService.completeOAuthRegistration(
        body.tempKey,
        body.phone,
      );

      this.setRefreshTokenCookie(response, result.refresh_token);
      const { refresh_token, ...responseData } = result;
      return responseData;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new HttpException(
        'Registration failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
