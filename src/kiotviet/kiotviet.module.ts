import { Module } from '@nestjs/common';
import { KiotvietService } from './kiotviet.service';
import { KiotvietController } from './kiotviet.controller';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [ConfigService],
  controllers: [KiotvietController],
  providers: [KiotvietService],
})
export class KiotvietModule {}
