import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ProductSyncService } from './product-sync.service';
import { OrderSyncService } from './order-sync.service';

@Controller('sync')
export class SyncController {
  [x: string]: any;
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

  @Get('categories/products')
  async getProductsInCategories() {
    const results = {};

    for (const categoryId of this.productSyncService.getAllowedCategoryIds()) {
      try {
        const products =
          await this.KiotvietService.getProductsByCategory(categoryId);
        results[categoryId] = {
          count: products.data?.length || 0,
          sampleProducts: products.data?.slice(0, 3).map((p) => p.name) || [],
        };
      } catch (error) {
        results[categoryId] = { error: error.message };
      }
    }

    return results;
  }
}
