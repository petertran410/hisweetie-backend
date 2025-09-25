import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClientAuthService } from './client-auth.service';
import { RegisterDto } from './dto/register.dto';
import { ClientLoginDto } from './dto/login.dto';

@ApiTags('client-auth')
@Controller('client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register new client user' })
  async register(@Body() registerDto: RegisterDto) {
    return this.clientAuthService.register(registerDto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Client user login' })
  async login(@Body() loginDto: ClientLoginDto) {
    return this.clientAuthService.login(loginDto);
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify email address' })
  async verifyEmail(
    @Body() { user_id, code }: { user_id: string; code: string },
  ) {
    return this.clientAuthService.verifyEmail(user_id, code);
  }
}
