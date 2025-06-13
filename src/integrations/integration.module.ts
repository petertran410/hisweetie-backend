// src/integrations/integration.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

// Services
import { KiotVietService } from './kiotviet/kiotviet.service';
import { LarkService } from './lark/lark.service';
import { CustomerSyncService } from './customer-sync/customer-sync.service';

// Controllers
import { CustomerSyncController } from './customer-sync/customer-sync.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 seconds timeout for API calls
      maxRedirects: 3,
    }),
    ScheduleModule.forRoot(), // Enable scheduled tasks
    ConfigModule,
  ],
  providers: [KiotVietService, LarkService, CustomerSyncService],
  controllers: [CustomerSyncController],
  exports: [
    KiotVietService,
    LarkService,
    CustomerSyncService,
    HttpModule, // Export HttpModule so controller can use it
  ],
})
export class IntegrationModule {}
