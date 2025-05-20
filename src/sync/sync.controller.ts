import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ProductSyncService } from './product-sync.service';
import { OrderSyncService } from './order-sync.service';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly productSyncService: ProductSyncService,
    private readonly orderSyncService: OrderSyncService,
  ) {}

  @Post('products/full')
  syncAllProducts() {
    return this.productSyncService.syncAllProducts();
  }

  @Get('products/incremental')
  incrementalProductSync() {
    return this.productSyncService.incrementalSync();
  }

  @Post('orders')
  createOrder(@Body() orderData: any) {
    return this.orderSyncService.createOrderAndSyncToKiotViet(orderData);
  }
}
