import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { SepayService } from './sepay.service';
import { KiotVietService } from '../kiotviet/kiotviet.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    PrismaModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, SepayService, KiotVietService],
  exports: [PaymentService, SepayService, KiotVietService],
})
export class PaymentModule {}
