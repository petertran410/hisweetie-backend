import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { JwtStrategy } from './jwt.strategy';
import { KiotVietAuthService } from './kiotviet-auth/auth.service';

@Module({
  imports: [
    UserModule,
    HttpModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secretKey = configService.get<string>('APP_SECRET_KEY');
        const expiresIn = configService.get<string>('TOKEN_EXPIRES_IN') || '1d';

        if (!secretKey) {
          throw new Error(
            'APP_SECRET_KEY is not defined in environment variables',
          );
        }

        return {
          secret: secretKey,
          signOptions: {
            expiresIn: expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, KiotVietAuthService],
  exports: [AuthService, JwtStrategy, PassportModule, KiotVietAuthService],
})
export class AuthModule {}
