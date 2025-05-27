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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UserModule,
    AdminModule,
    CategoryModule,
    ProductModule,
    NewsModule,
    JobpostModule,
    FileModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
