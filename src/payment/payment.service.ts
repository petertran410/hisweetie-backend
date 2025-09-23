import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SepayService } from './sepay.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private sepayService: SepayService,
  ) {}

  async createOrder(createPaymentDto: CreatePaymentDto) {
    const { customerInfo, cartItems, paymentMethod, amounts } =
      createPaymentDto;

    try {
      const order = await this.prisma.product_order.create({
        data: {
          total: BigInt(amounts.total),
          full_name: customerInfo.fullName,
          email: customerInfo.email,
          phone: customerInfo.phone,
          address: customerInfo.address,
          note: customerInfo.note || '',
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'cod' ? 'PAID' : 'PENDING',
          status: paymentMethod === 'cod' ? 'CONFIRMED' : 'PENDING',
          product_list: JSON.stringify(cartItems),
        },
      });

      await this.logPaymentEvent(Number(order.id), 'ORDER_CREATED', {
        customerInfo,
        cartItems,
        amounts,
      });

      let qrCodeUrl = '';
      if (paymentMethod === 'sepay_bank') {
        qrCodeUrl = this.sepayService.generateQRCode(
          order.id.toString(),
          amounts.total,
        );
      }

      return {
        success: true,
        orderId: order.id.toString(),
        qrCodeUrl,
        paymentMethod,
        total: amounts.total,
      };
    } catch (error) {
      this.logger.error('Failed to create order:', error);
      throw new BadRequestException(`Failed to create order: ${error.message}`);
    }
  }

  async checkPaymentStatus(orderId: string) {
    try {
      const order = await this.prisma.product_order.findUnique({
        where: { id: BigInt(orderId) },
      });

      if (!order) {
        throw new BadRequestException('Order not found');
      }

      return {
        success: true,
        status: order.payment_status || 'PENDING',
        orderId,
        amount: Number(order.total),
        paymentMethod: order.payment_method,
        orderStatus: order.status,
      };
    } catch (error) {
      this.logger.error(
        `Failed to check payment status for ${orderId}:`,
        error,
      );
      throw new BadRequestException(
        `Failed to check payment status: ${error.message}`,
      );
    }
  }

  async handleWebhook(webhookData: any) {
    try {
      this.logger.log('=== WEBHOOK PROCESSING START ===');
      this.logger.log(
        'Full webhook data:',
        JSON.stringify(webhookData, null, 2),
      );

      // Map đúng field names theo SePay API
      const mappedData = {
        content: webhookData.content || webhookData.description,
        transferAmount: webhookData.transferAmount,
        transferType: webhookData.transferType,
        transactionId: webhookData.referenceCode || webhookData.code,
        accountNumber: webhookData.accountNumber,
        gateway: webhookData.gateway,
        transactionDate: webhookData.transactionDate,
        accumulated: webhookData.accumulated,
        subAccount: webhookData.subAccount,
      };

      this.logger.log('Mapped data:', mappedData);

      // Check if this is an incoming transaction
      if (!mappedData.transferType || mappedData.transferType !== 'in') {
        this.logger.warn(
          'Not an incoming transaction. Type:',
          mappedData.transferType,
        );
        return { success: false, message: 'Not an incoming transaction' };
      }

      if (!mappedData.content || !mappedData.transferAmount) {
        this.logger.error('Missing required fields: content or transferAmount');
        return { success: false, message: 'Missing required webhook data' };
      }

      // Extract order ID from content
      const orderPatterns = [/DH(\d+)/i, /(?:^|\s)(\d+)(?:\s|$)/];
      let orderId = null;

      for (const pattern of orderPatterns) {
        const match = mappedData.content.match(pattern);
        if (match && match[1]) {
          orderId = match[1];
          break;
        }
      }

      if (!orderId) {
        this.logger.error('Order ID not found in content:', mappedData.content);
        return { success: false, message: 'Order ID not found' };
      }

      this.logger.log('Extracted order ID:', orderId);

      // Find order using correct model
      const order = await this.prisma.product_order.findFirst({
        where: {
          id: BigInt(orderId),
          total: BigInt(mappedData.transferAmount),
          payment_status: 'PENDING',
        },
      });

      if (!order) {
        this.logger.error(
          `Order not found: ID=${orderId}, Amount=${mappedData.transferAmount}`,
        );
        return {
          success: false,
          message: 'Order not found or already processed',
        };
      }

      // Update order status
      await this.prisma.product_order.update({
        where: { id: BigInt(orderId) },
        data: {
          payment_status: 'PAID',
          status: 'CONFIRMED',
          updated_date: new Date(),
          updated_by: 'SEPAY_WEBHOOK',
        },
      });

      // Log payment event
      await this.prisma.payment_logs.create({
        data: {
          order_id: BigInt(orderId),
          event_type: 'PAYMENT_SUCCESS',
          event_data: mappedData,
          sepay_response: webhookData,
          created_date: new Date(),
          ip_address: 'SEPAY_SERVER',
          user_agent: 'SEPAY_WEBHOOK',
        },
      });

      // Save webhook data
      await this.prisma.payment_webhooks.create({
        data: {
          webhook_id: mappedData.transactionId || `SEPAY_${Date.now()}`,
          provider: 'sepay',
          order_code: `DH${orderId}`,
          transaction_id: mappedData.transactionId,
          status: 'SUCCESS',
          amount: BigInt(mappedData.transferAmount),
          gateway_code: mappedData.gateway || 'BANK_TRANSFER',
          signature: 'N/A',
          raw_data: webhookData,
          processed: true,
          processed_at: new Date(),
          created_date: new Date(),
        },
      });

      this.logger.log(`✅ Order ${orderId} payment confirmed`);
      return {
        success: true,
        message: 'Payment processed successfully',
        orderId,
      };
    } catch (error) {
      this.logger.error('Webhook processing failed:', error.stack);

      // Log error
      try {
        await this.prisma.payment_logs.create({
          data: {
            order_id: BigInt(0), // Unknown order
            event_type: 'WEBHOOK_ERROR',
            event_data: { error: error.message },
            sepay_response: webhookData,
            created_date: new Date(),
          },
        });
      } catch (logError) {
        this.logger.error('Failed to log error:', logError);
      }

      return { success: false, message: 'Webhook processing failed' };
    }
  }

  private async updateOrderPaymentStatus(
    orderId: string,
    status: string,
    transactionData?: any,
  ) {
    await this.prisma.product_order.update({
      where: { id: BigInt(orderId) },
      data: {
        payment_status: status,
        status: status === 'PAID' ? 'CONFIRMED' : 'PENDING',
        updated_date: new Date(),
        updated_by: 'SEPAY_WEBHOOK',
      },
    });

    await this.prisma.payment_logs.create({
      data: {
        order_id: BigInt(orderId),
        event_type: 'PAYMENT_STATUS_UPDATED',
        event_data: { status, transactionData },
        created_date: new Date(),
      },
    });
  }

  private async logPaymentEvent(
    orderId: number,
    eventType: string,
    eventData: any,
  ) {
    try {
      await this.prisma.payment_logs.create({
        data: {
          order_id: BigInt(orderId),
          event_type: eventType,
          event_data: eventData,
          created_date: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to log payment event:', error);
    }
  }

  async getOrderDebugInfo(orderId: string) {
    const order = await this.prisma.product_order.findUnique({
      where: { id: BigInt(orderId) },
    });

    const logs = await this.prisma.payment_logs.findMany({
      where: { order_id: BigInt(orderId) },
      orderBy: { created_date: 'desc' },
    });

    const webhooks = await this.prisma.payment_webhooks.findMany({
      where: { order_code: `DH${orderId}` },
      orderBy: { created_date: 'desc' },
    });

    return { order, logs, webhooks };
  }
}
