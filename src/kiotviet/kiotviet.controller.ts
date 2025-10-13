import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { KiotVietWebhookService } from './kiotviet-webhook.service';
import { Public } from '../auth/public.decorator';

@ApiTags('kiotviet-webhook')
@Controller('kiotviet/webhook')
export class KiotVietWebhookController {
  private readonly logger = new Logger(KiotVietWebhookController.name);

  constructor(private readonly webhookService: KiotVietWebhookService) {}

  @Public()
  @Post('order-status')
  async handleOrderStatusChange(@Body() webhookData: any) {
    this.logger.log('KiotViet webhook received:', webhookData);
    return await this.webhookService.processOrderStatusChange(webhookData);
  }
}
