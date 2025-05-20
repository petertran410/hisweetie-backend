// src/sync/sync.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KiotvietService } from '../kiotviet/kiotviet.service';
import { ProductSyncService } from './product-sync.service';
import { OrderSyncService } from './order-sync.service';
import { SyncController } from './sync.controller';

@Module({
  imports: [HttpModule],
  providers: [KiotvietService, ProductSyncService, OrderSyncService],
  controllers: [SyncController],
  exports: [ProductSyncService, OrderSyncService],
})
export class SyncModule {}
