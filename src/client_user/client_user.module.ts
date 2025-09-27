import { Module } from '@nestjs/common';
import { ClientUserService } from './client_user.service';
import { ClientUserController } from './client_user.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [PrismaModule, ProductModule],
  controllers: [ClientUserController],
  providers: [ClientUserService],
  exports: [ClientUserService],
})
export class ClientUserModule {}
