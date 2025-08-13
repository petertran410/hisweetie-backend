import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { KiotVietService } from '../product/kiotviet.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';

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
  controllers: [CategoryController],
  providers: [CategoryService, KiotVietService],
  exports: [CategoryService],
})
export class CategoryModule {}
