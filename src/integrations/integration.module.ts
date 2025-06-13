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
  exports: [KiotVietService, LarkService, CustomerSyncService],
})
export class IntegrationModule {}

// src/app.module.ts - Add this import to your main app module
/*
import { IntegrationModule } from './integrations/integration.module';

@Module({
  imports: [
    // ... your existing imports
    IntegrationModule, // Add this line
  ],
  // ... rest of your module configuration
})
export class AppModule {}
*/

// Environment Variables Configuration
// Add these to your .env file:
/*
# KiotViet API Configuration
KIOTVIET_API_KEY=your_kiotviet_api_key_here
KIOTVIET_WEBHOOK_SECRET=your_webhook_secret_key_here

# Lark Suite API Configuration  
LARK_ACCESS_TOKEN=your_lark_access_token_here

# Optional: Database for storing sync metadata (if you want to use DB instead of in-memory)
# DATABASE_URL=your_database_connection_string
*/
