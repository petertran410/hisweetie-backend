import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class KiotVietWebhookService {
  private readonly logger = new Logger(KiotVietWebhookService.name);
  private readonly webhookSecret: string | undefined;
  private readonly WEBSITE_BRANCH_ID = 635934;
  private readonly WEBSITE_SALE_CHANNEL_ID = 496738;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.webhookSecret = this.configService.get<string>(
      'KIOTVIET_WEBHOOK_SECRET',
    );
  }

  verifySignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('Webhook secret not configured, skipping verification');
      return true;
    }

    const secret = Buffer.from(this.webhookSecret, 'base64').toString('utf-8');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return signature === expectedSignature;
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
              `Skipping order ${order.Id} - BranchId ${order.BranchId} is not website branch (${this.WEBSITE_BRANCH_ID})`,
            );
            skippedCount++;
            continue;
          }

          if (order.SaleChannelId !== this.WEBSITE_SALE_CHANNEL_ID) {
            this.logger.log(
              `Skipping order ${order.Id} - SaleChannelId ${order.SaleChannelId} is not website channel (${this.WEBSITE_SALE_CHANNEL_ID})`,
            );
            skippedCount++;
            continue;
          }

          const statusMapping = {
            1: 'CONFIRMED',
            2: 'CANCELLED',
            3: 'SHIPPING',
            5: 'CANCELLED',
          };

          const internalStatus = statusMapping[order.Status];

          if (!internalStatus) {
            this.logger.warn(
              `Unknown order status: ${order.Status} for order ${order.Id}`,
            );
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
              `✅ Updated order ${order.Id} (KiotViet) to status ${internalStatus} - Branch: ${order.BranchId}, Channel: ${order.SaleChannelId}`,
            );
            processedCount++;
          } else {
            this.logger.warn(
              `Order ${order.Id} not found in database (might not be from website)`,
            );
          }
        }
      }

      this.logger.log(
        `Webhook processing completed: ${processedCount} updated, ${skippedCount} skipped`,
      );

      return {
        success: true,
        processed: processedCount,
        skipped: skippedCount,
      };
    } catch (error) {
      this.logger.error('Webhook processing error:', error);
      throw error;
    }
  }
}
