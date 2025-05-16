import { Module } from '@nestjs/common';
import { JobpostService } from './jobpost.service';
import { JobpostController } from './jobpost.controller';

@Module({
  controllers: [JobpostController],
  providers: [JobpostService],
})
export class JobpostModule {}
