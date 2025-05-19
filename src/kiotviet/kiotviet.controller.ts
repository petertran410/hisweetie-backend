import { Controller, Get, Post, Query } from '@nestjs/common';
import { KiotvietService } from './kiotviet.service';

@Controller('kiotviet')
export class KiotvietController {
  constructor(private readonly kiotvietService: KiotvietService) {}

  @Post('sync')
  async syncProducts() {
    return this.kiotvietService.syncProducts();
  }

  @Get('products')
  async getProducts(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '10',
  ) {
    return this.kiotvietService.getProductsFromDb(
      parseInt(page),
      parseInt(pageSize),
    );
  }
}
