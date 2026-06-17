import { Module } from '@nestjs/common';
import { RedirectService } from './redirect.service';
import { RedirectController } from './redirect.controller';
import { RevalidateService } from '../common/revalidate.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RedirectController],
  providers: [RedirectService, RevalidateService],
  exports: [RedirectService],
})
export class RedirectModule {}
