// src/category/category.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { KiotVietService } from '../product/kiotviet.service';

@Module({
  imports: [ConfigModule], // Import ConfigModule for KiotVietService
  controllers: [CategoryController],
  providers: [CategoryService, KiotVietService], // Add KiotVietService as provider
  exports: [CategoryService, KiotVietService], // Export for use in other modules
})
export class CategoryModule {}
