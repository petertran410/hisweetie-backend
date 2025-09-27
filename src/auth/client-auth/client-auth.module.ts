import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientAuthService } from './client-auth.service';
import { ClientAuthController } from './client-auth.controller';
import { ClientJwtStrategy } from './client-jwt.strategy';
import { ClientUserModule } from '../../client_user/client_user.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { KiotVietService } from 'src/product/kiotviet.service';

@Module({
  imports: [
    ClientUserModule,
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'client-jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secretKey = configService.get<string>('APP_SECRET_KEY');
        const expiresIn = configService.get<string>('TOKEN_EXPIRES_IN') || '7d';

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
  controllers: [ClientAuthController],
  providers: [ClientAuthService, ClientJwtStrategy, KiotVietService],
  exports: [ClientAuthService, ClientJwtStrategy, PassportModule],
})
export class ClientAuthModule {}
