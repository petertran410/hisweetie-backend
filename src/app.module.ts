import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './product/product.module';
import { NewsModule } from './news/news.module';
import { JobpostModule } from './jobpost/jobpost.module';
import { FileModule } from './file/file.module';
import { PagesModule } from './pages/pages.module';
import { PrismaModule } from './prisma/prisma.module';
import { PaymentModule } from './payment/payment.module';
import { ClientUserModule } from './client_user/client_user.module';
import { ClientAuthModule } from './auth/client-auth/client-auth.module';
import { KiotVietModule } from './kiotviet/kiotviet.module';
import { CartModule } from './cart/cart.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 600000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 3600000,
        limit: 100,
      },
    ]),

    PrismaModule,
    AuthModule,
    UserModule,
    AdminModule,
    CategoryModule,
    ProductModule,
    NewsModule,
    JobpostModule,
    FileModule,
    PagesModule,
    PaymentModule,
    ClientUserModule,
    ClientAuthModule,
    KiotVietModule,
    CartModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
