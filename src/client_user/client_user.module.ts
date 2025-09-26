import { Module } from '@nestjs/common';
import { ClientUserService } from './client_user.service';
import { ClientUserController } from './client_user.controller';

@Module({
  controllers: [ClientUserController],
  providers: [ClientUserService],
})
export class ClientUserModule {}
