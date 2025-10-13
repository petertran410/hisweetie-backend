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
  private readonly SKIP_VERIFICATION = true;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.WEBHOOK_SECRET = this.configService.get<string>(
      'KIOTVIET_WEBHOOK_SECRET',
    );
  }

  private logSignatureDebug(body: string, signature: string): void {
    if (!this.WEBHOOK_SECRET) {
      this.logger.warn('KIOTVIET_WEBHOOK_SECRET not configured');
      return;
    }

    this.logger.log('🔍 ============ SIGNATURE DEBUG ============');
    this.logger.log(`📨 Received signature: "${signature}"`);
    this.logger.log(`📏 Signature length: ${signature.length}`);
    this.logger.log(`📄 Raw body length: ${body.length}`);
    this.logger.log(`📄 Raw body sample: ${body.substring(0, 150)}...`);

    const secretBuffer = Buffer.from(this.WEBHOOK_SECRET, 'base64');
    this.logger.log(`🔑 Secret decoded length: ${secretBuffer.length} bytes`);

    const hmac = crypto.createHmac('sha256', secretBuffer);
    const calculatedBuffer = hmac.update(body, 'utf8').digest();

    const formats = {
      hex: calculatedBuffer.toString('hex'),
      base64: calculatedBuffer.toString('base64'),
      base64_urlsafe: calculatedBuffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, ''),
    };

    this.logger.log(`🔐 Expected signatures:`);
    this.logger.log(`   - HEX: ${formats.hex}`);
    this.logger.log(`   - BASE64: ${formats.base64}`);
    this.logger.log(`   - BASE64_URL_SAFE: ${formats.base64_urlsafe}`);

    let signatureToCompare = signature.trim();
    if (signatureToCompare.toLowerCase().startsWith('sha256=')) {
      signatureToCompare = signatureToCompare.substring(7);
      this.logger.log(`✂️ After removing prefix: "${signatureToCompare}"`);
    }

    this.logger.log(`🎯 Matches:`);
    this.logger.log(
      `   - HEX match: ${signatureToCompare.toLowerCase() === formats.hex}`,
    );
    this.logger.log(
      `   - BASE64 match: ${signatureToCompare === formats.base64}`,
    );
    this.logger.log(
      `   - BASE64_URL_SAFE match: ${signatureToCompare === formats.base64_urlsafe}`,
    );
    this.logger.log('🔍 ========================================');
  }

  async processOrderStatusChange(
    webhookData: any,
    signature?: string,
    rawBody?: string,
  ) {
    try {
      if (signature && rawBody) {
        this.logSignatureDebug(rawBody, signature);

        if (this.SKIP_VERIFICATION) {
          this.logger.warn('⚠️ SIGNATURE VERIFICATION SKIPPED (DEBUG MODE)');
        } else {
          this.logger.error(
            '❌ Signature verification is disabled in production!',
          );
          throw new UnauthorizedException('Invalid signature');
        }
      } else {
        this.logger.warn('⚠️ Signature or rawBody missing');
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
