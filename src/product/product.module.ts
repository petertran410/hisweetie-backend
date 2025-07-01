// src/product/product.module.ts - FINAL VERSION
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { KiotVietService } from './kiotviet.service';

@Module({
  imports: [
    ConfigModule, // For KiotViet credentials
  ],
  controllers: [ProductController],
  providers: [ProductService, KiotVietService],
  exports: [ProductService, KiotVietService], // Export for use in other modules
})
export class ProductModule {}
