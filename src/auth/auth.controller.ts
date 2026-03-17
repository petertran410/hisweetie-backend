import {
  Controller,
  Post,
  HttpCode,
  HttpException,
  HttpStatus,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDTO } from './dto/login-auth.dto';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(200)
  @Post('login')
  login(@Body() loginDTO: LoginDTO) {
    try {
      return this.authService.login(loginDTO);
    } catch (error) {
      if (error.status != 500) {
        console.log(error);
        throw new HttpException(error.response, error.status);
      }
      console.log(error);
      throw new HttpException('Error...', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('renew')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Renew CMS JWT token before expiry' })
  async renewToken(@Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      throw new Error('User not found in token');
    }
    return this.authService.renewToken(userId);
  }
}
