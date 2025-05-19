import { Module } from '@nestjs/common';
import { KiotvietService } from './kiotviet.service';
import { KiotvietController } from './kiotviet.controller';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [KiotvietController],
  providers: [KiotvietService],
})
export class KiotvietModule {}
