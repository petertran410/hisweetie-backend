// src/category/category.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { KiotVietService } from '../product/kiotviet.service'; // Import from product module

@Module({
  imports: [
    ConfigModule, // For KiotVietService credentials
  ],
  controllers: [CategoryController],
  providers: [
    CategoryService,
    KiotVietService, // Provide KiotVietService locally
  ],
  exports: [CategoryService], // Export CategoryService
})
export class CategoryModule {}
