import { Module } from '@nestjs/common';
import { KiotvietService } from './kiotviet.service';
import { KiotvietController } from './kiotviet.controller';

@Module({
  controllers: [KiotvietController],
  providers: [KiotvietService],
})
export class KiotvietModule {}
