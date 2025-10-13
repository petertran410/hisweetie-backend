import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class KiotVietWebhookService {
  private readonly logger = new Logger(KiotVietWebhookService.name);
  private readonly WEBHOOK_SECRET: string | undefined;
  private readonly WEBSITE_BRANCH_ID = 635934;
  private readonly WEBSITE_SALE_CHANNEL_ID = 496738;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.WEBHOOK_SECRET = this.configService.get<string>(
      'KIOTVIET_WEBHOOK_SECRET',
    );
  }

  private verifySignature(body: string, signature: string): boolean {
    if (!this.WEBHOOK_SECRET) {
      this.logger.warn('KIOTVIET_WEBHOOK_SECRET not configured');
      return true;
    }

    if (!signature) {
      this.logger.error('No signature provided');
      return false;
    }

    const hmac = crypto.createHmac(
      'sha256',
      Buffer.from(this.WEBHOOK_SECRET, 'base64'),
    );
    const calculatedHex = hmac.update(body, 'utf8').digest('hex');

    let receivedHex = signature.trim();
    if (receivedHex.toLowerCase().startsWith('sha256=')) {
      receivedHex = receivedHex.substring(7);
    }

    if (receivedHex.length !== calculatedHex.length) {
      this.logger.error(
        `Signature length mismatch - Received: ${receivedHex.length} bytes, Expected: ${calculatedHex.length} bytes`,
      );
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedHex.toLowerCase(), 'hex'),
        Buffer.from(calculatedHex, 'hex'),
      );
    } catch (error) {
      this.logger.error(`Signature comparison error: ${error.message}`);
      return false;
    }
  }

  async processOrderStatusChange(
    webhookData: any,
    signature?: string,
    rawBody?: string,
  ) {
    try {
      if (signature && rawBody) {
        const isValid = this.verifySignature(rawBody, signature);
        if (!isValid) {
          this.logger.error('Invalid webhook signature');
          throw new UnauthorizedException('Invalid signature');
        }
        this.logger.log('✅ Signature verified');
      }

      const { Id, Notifications } = webhookData;

      if (!Notifications || Notifications.length === 0) {
        return { success: true, message: 'No notifications to process' };
      }

      let processedCount = 0;
      let skippedCount = 0;

      for (const notification of Notifications) {
        const { Action, Data } = notification;

        if (!Data || Data.length === 0) continue;

        for (const order of Data) {
          if (order.BranchId !== this.WEBSITE_BRANCH_ID) {
            this.logger.log(
              `⏭️ Skipping order ${order.Code} - Wrong BranchId (${order.BranchId})`,
            );
            skippedCount++;
            continue;
          }

          if (order.SaleChannelId !== this.WEBSITE_SALE_CHANNEL_ID) {
            this.logger.log(
              `⏭️ Skipping order ${order.Code} - Wrong SaleChannelId (${order.SaleChannelId})`,
            );
            skippedCount++;
            continue;
          }

          const statusMapping = {
            5: 'CONFIRMED',
            3: 'SHIPPING',
          };

          const internalStatus = statusMapping[order.Status];

          if (!internalStatus) {
            this.logger.warn(
              `⚠️ Unmapped status ${order.Status} for order ${order.Code}`,
            );
            skippedCount++;
            continue;
          }

          const updated = await this.prisma.product_order.updateMany({
            where: { order_kiot_id: order.Id },
            data: {
              status: internalStatus,
              updated_date: new Date(),
            },
          });

          if (updated.count > 0) {
            this.logger.log(
              `✅ Order ${order.Code} updated to ${internalStatus} (KiotViet Status: ${order.Status})`,
            );
            processedCount++;
          } else {
            this.logger.warn(
              `⚠️ Order ${order.Code} (ID: ${order.Id}) not found in database`,
            );
            skippedCount++;
          }
        }
      }

      this.logger.log(
        `🎯 Webhook processed: ${processedCount} updated, ${skippedCount} skipped`,
      );

      return {
        success: true,
        processed: processedCount,
        skipped: skippedCount,
      };
    } catch (error) {
      this.logger.error('❌ Webhook processing error:', error);
      throw error;
    }
  }
}
