import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { KiotVietService } from './kiotviet.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [ProductController],
  providers: [ProductService, KiotVietService],
  exports: [ProductService, KiotVietService],
})
export class ProductModule {}
