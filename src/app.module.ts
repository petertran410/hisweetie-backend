// src/app.module.ts - UPDATED
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './product/product.module';
import { NewsModule } from './news/news.module';
import { JobpostModule } from './jobpost/jobpost.module';
import { FileModule } from './file/file.module';
import { PagesModule } from './pages/pages.module'; // THÊM MODULE PAGES
// import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AuthModule,
    UserModule,
    AdminModule,
    CategoryModule,
    ProductModule,
    NewsModule,
    JobpostModule,
    FileModule,
    PagesModule, // THÊM MODULE PAGES VÀO IMPORTS
    // PaymentModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
