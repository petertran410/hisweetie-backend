import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { KiotVietService } from './kiotviet.service';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 10,
    }),
    ConfigModule,
    PrismaModule,
    AuthModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, KiotVietService],
  exports: [ProductService, KiotVietService],
})
export class ProductModule {}
