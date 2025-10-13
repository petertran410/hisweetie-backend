import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { KiotVietService } from './kiotviet.service';
import { KiotVietWebhookService } from './kiotviet-webhook.service';
import { KiotVietWebhookController } from './kiotviet.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [HttpModule, ConfigModule, PrismaModule],
  controllers: [KiotVietWebhookController],
  providers: [KiotVietService, KiotVietWebhookService],
  exports: [KiotVietService, KiotVietWebhookService],
})
export class KiotVietModule {}
