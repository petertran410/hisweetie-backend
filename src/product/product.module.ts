import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { CategoryModule } from '../category/category.module';
import { KiotVietService } from './kiotviet.service';
import { PosProductSyncService } from './pos-product-sync.service';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RevalidateService } from '../common/revalidate.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 10,
    }),
    ConfigModule,
    PrismaModule,
    AuthModule,
    CategoryModule,
  ],
  controllers: [ProductController],
  providers: [
    ProductService,
    KiotVietService,
    PosProductSyncService,
    RevalidateService,
  ],
  exports: [ProductService, KiotVietService, PosProductSyncService],
})
export class ProductModule {}
