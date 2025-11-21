import {
  Controller,
  Post,
  HttpCode,
  HttpException,
  HttpStatus,
  Body,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDTO } from './dto/login-auth.dto';

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
}
