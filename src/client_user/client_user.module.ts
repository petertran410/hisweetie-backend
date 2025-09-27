import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ClientUserService } from './client_user.service';
import { ClientUserController } from './client_user.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductModule } from '../product/product.module';
import { KiotVietService } from '../kiotviet/kiotviet.service';

@Module({
  imports: [
    PrismaModule,
    ProductModule,
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 10,
    }),
    ConfigModule,
  ],
  controllers: [ClientUserController],
  providers: [ClientUserService, KiotVietService],
  exports: [ClientUserService],
})
export class ClientUserModule {}
