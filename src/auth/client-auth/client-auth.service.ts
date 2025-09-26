import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClientUserService } from '../../client_user/client_user.service';
import { ClientRegisterDto } from './dto/client-register.dto';
import { ClientLoginDto } from './dto/client-login.dto';

@Injectable()
export class ClientAuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private clientUserService: ClientUserService,
  ) {}

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

    const { pass_word, ...userResponse } = newUser;
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

    const secretKey = this.configService.get<string>('APP_SECRET_KEY');
    const expiresIn =
      this.configService.get<string>('TOKEN_EXPIRES_IN') || '7d';

    if (!secretKey) {
      throw new Error('APP_SECRET_KEY is not defined in environment variables');
    }

    const token = await this.jwtService.signAsync(
      {
        sub: user.client_id,
        email: user.email,
        type: 'client',
      },
      {
        expiresIn: expiresIn,
        secret: secretKey,
      },
    );

    const { pass_word, ...userResponse } = user;
    return {
      message: 'Login successful',
      token,
      user: userResponse,
    };
  }
}
