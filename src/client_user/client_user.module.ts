import { Module } from '@nestjs/common';
import { ClientUserService } from './client_user.service';
import { ClientUserController } from './client_user.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { KiotVietService } from 'src/product/kiotviet.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClientUserController],
  providers: [ClientUserService, KiotVietService],
  exports: [ClientUserService],
})
export class ClientUserModule {}
