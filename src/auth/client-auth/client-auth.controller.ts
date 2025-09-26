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

@ApiTags('client-auth')
@Controller('client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  private setRefreshTokenCookie(response: Response, refreshToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';

    response.cookie('refresh_token', refreshToken, {
      httpOnly: true, // Không accessible từ JavaScript
      secure: isProduction, // HTTPS only trong production
      sameSite: isProduction ? 'none' : 'lax', // CSRF protection
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/', // Available for entire app
    });
  }

  private clearRefreshTokenCookie(response: Response) {
    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new client user with auto login' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully with auto login',
  })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @UsePipes(new ValidationPipe())
  async register(
    @Body() registerDto: ClientRegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.clientAuthService.register(registerDto);

      // Set refresh token trong httpOnly cookie
      this.setRefreshTokenCookie(response, result.refresh_token);

      // Return response without refresh_token
      const { refresh_token, ...responseData } = result;
      return responseData;
    } catch (error) {
      if (error.status && error.status !== 500) {
        throw error;
      }
      throw new HttpException(
        'Registration failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
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
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.clientAuthService.login(loginDto);

      // Set refresh token trong httpOnly cookie
      this.setRefreshTokenCookie(response, result.refresh_token);

      // Return response without refresh_token
      const { refresh_token, ...responseData } = result;
      return responseData;
    } catch (error) {
      if (error.status && error.status !== 500) {
        throw error;
      }
      throw new HttpException('Login failed', HttpStatus.INTERNAL_SERVER_ERROR);
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

      const result =
        await this.clientAuthService.refreshTokenFromCookie(refreshToken);

      // Set new refresh token trong httpOnly cookie
      this.setRefreshTokenCookie(response, result.refresh_token);

      // Return response without refresh_token
      const { refresh_token, ...responseData } = result;
      return responseData;
    } catch (error) {
      // Clear invalid cookie
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
      const result = await this.clientAuthService.logout(client.clientId);

      // Clear refresh token cookie
      this.clearRefreshTokenCookie(response);

      return result;
    } catch (error) {
      throw new HttpException(
        'Logout failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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

  @Get('check-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check authentication status using cookie' })
  @ApiResponse({ status: 200, description: 'Authentication status checked' })
  async checkAuth(@Req() request: Request) {
    try {
      const refreshToken = request.cookies?.refresh_token;

      if (!refreshToken) {
        return { authenticated: false, message: 'No refresh token found' };
      }

      const result =
        await this.clientAuthService.refreshTokenFromCookie(refreshToken);

      return {
        authenticated: true,
        access_token: result.access_token,
        user: result.user,
      };
    } catch (error) {
      return { authenticated: false, message: 'Invalid refresh token' };
    }
  }
}
