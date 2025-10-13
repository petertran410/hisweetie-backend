import { Controller, Post, Body, Logger, Headers, Req } from '@nestjs/common';
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
  async handleOrderStatusChange(
    @Body() webhookData: any,
    @Headers('x-hub-signature') signature: string,
    @Req() req: any,
  ) {
    this.logger.log('=== KiotViet Webhook Received ===');
    this.logger.log('Webhook ID:', webhookData.Id);
    this.logger.log(
      'Notifications count:',
      webhookData.Notifications?.length || 0,
    );

    const rawBody = JSON.stringify(webhookData);

    const result = await this.webhookService.processOrderStatusChange(
      webhookData,
      signature,
      rawBody,
    );

    this.logger.log(
      `✅ Webhook processed: ${result.processed} updated, ${result.skipped} skipped`,
    );
    return result;
  }
}
