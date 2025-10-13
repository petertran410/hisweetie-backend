import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { KiotVietService } from './kiotviet.service';
import { Public } from '../auth/public.decorator';

@Controller('kiotviet')
export class KiotVietController {
  private readonly logger = new Logger(KiotVietController.name);

  constructor(private readonly kiotVietService: KiotVietService) {}

  @Public()
  @Post('webhook/order-status')
  @HttpCode(HttpStatus.OK)
  async handleOrderWebhook(@Body() webhookData: any) {
    try {
      this.logger.log('📨 Received KiotViet webhook');
      this.logger.log(JSON.stringify(webhookData, null, 2));

      await this.kiotVietService.handleOrderWebhook(webhookData);

      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      this.logger.error('❌ Webhook processing error:', error);
      return { success: true, error: 'processed_with_error' };
    }
  }
}
