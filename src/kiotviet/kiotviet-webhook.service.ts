import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KiotVietWebhookService {
  private readonly logger = new Logger(KiotVietWebhookService.name);

  constructor(private prisma: PrismaService) {}

  async processOrderStatusChange(webhookData: any) {
    try {
      const { orderId, status } = webhookData;

      const statusMapping = {
        1: 'CONFIRMED',
        2: 'SHIPPING',
        3: 'DELIVERED',
        4: 'CANCELLED',
      };

      const internalStatus = statusMapping[status];

      if (!internalStatus) {
        return { success: true, message: 'Status not tracked' };
      }

      await this.prisma.product_order.updateMany({
        where: { order_kiot_id: orderId },
        data: {
          status: internalStatus,
          updated_date: new Date(),
        },
      });

      this.logger.log(`Updated order ${orderId} to status ${internalStatus}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Webhook processing error:', error);
      return { success: false, error: error.message };
    }
  }
}
