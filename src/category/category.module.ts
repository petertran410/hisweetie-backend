import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { KiotVietService } from '../product/kiotviet.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 10,
    }),
    ConfigModule,
  ],
  controllers: [CategoryController],
  providers: [CategoryService, KiotVietService],
  exports: [CategoryService],
})
export class CategoryModule {}
