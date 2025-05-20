import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KiotvietModule } from '../kiotviet/kiotviet.module';
import { ProductSyncService } from './product-sync.service';
import { OrderSyncService } from './order-sync.service';
import { SyncController } from './sync.controller';

@Module({
  imports: [HttpModule, KiotvietModule],
  providers: [ProductSyncService, OrderSyncService],
  controllers: [SyncController],
  exports: [ProductSyncService, OrderSyncService],
})
export class SyncModule {}
