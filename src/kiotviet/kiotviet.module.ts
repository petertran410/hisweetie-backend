import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { KiotvietService } from './kiotviet.service';
import { KiotvietController } from './kiotviet.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [KiotvietController],
  providers: [KiotvietService],
  exports: [KiotvietService],
})
export class KiotvietModule {}
