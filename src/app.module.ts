import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { CategoryModule } from './category/category.module';
import { FileModule } from './file/file.module';
import { InternalModule } from './internal/internal.module';
import { JobpostModule } from './jobpost/jobpost.module';
import { NewsModule } from './news/news.module';
import { ProductModule } from './product/product.module';
import { ScheduleModule } from '@nestjs/schedule';
import { KiotvietModule } from './kiotviet/kiotviet.module';

@Module({
  imports: [
    UserModule,
    AuthModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AdminModule,
    CategoryModule,
    FileModule,
    InternalModule,
    JobpostModule,
    NewsModule,
    ProductModule,
    KiotvietModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
