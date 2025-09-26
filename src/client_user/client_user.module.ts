import { Module } from '@nestjs/common';
import { ClientUserService } from './client_user.service';
import { ClientUserController } from './client_user.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClientUserController],
  providers: [ClientUserService],
  exports: [ClientUserService],
})
export class ClientUserModule {}
