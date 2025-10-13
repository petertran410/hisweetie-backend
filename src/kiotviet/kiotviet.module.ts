import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { KiotVietController } from './kiotviet.controller';
import { KiotVietService } from './kiotviet.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 10,
    }),
    ConfigModule,
    PrismaModule,
  ],
  controllers: [KiotVietController],
  providers: [KiotVietService],
  exports: [KiotVietService],
})
export class KiotVietModule {}
