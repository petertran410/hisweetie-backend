import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 5,
    }),
  ],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
