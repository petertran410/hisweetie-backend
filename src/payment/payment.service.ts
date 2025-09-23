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

      if (order.payment_status === 'PAID') {
        return {
          success: true,
          status: 'PAID',
          orderId,
          amount: Number(order.total),
        };
      }

      if (order.payment_method === 'sepay_bank') {
        const transaction = await this.sepayService.checkTransactions(
          orderId,
          Number(order.total),
        );

        if (transaction) {
          await this.updateOrderPaymentStatus(orderId, 'PAID', transaction);
          return {
            success: true,
            status: 'PAID',
            orderId,
            amount: Number(order.total),
            transactionId: transaction.id,
          };
        }
      }

      return {
        success: true,
        status: 'PENDING',
        orderId,
        amount: Number(order.total),
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
      this.logger.log('Input data keys:', Object.keys(webhookData || {}));
      this.logger.log(
        'Full webhook data:',
        JSON.stringify(webhookData, null, 2),
      );

      const possibleFields = {
        content:
          webhookData.content ||
          webhookData.transaction_content ||
          webhookData.transferContent ||
          webhookData.description,
        amount:
          webhookData.transferAmount ||
          webhookData.amount_in ||
          webhookData.amount ||
          webhookData.transferAmount,
        type:
          webhookData.transferType ||
          webhookData.transfer_type ||
          webhookData.type,
        transactionId:
          webhookData.id ||
          webhookData.transactionId ||
          webhookData.reference_code,
        accountNumber: webhookData.accountNumber || webhookData.account_number,
        bankName: webhookData.bankName || webhookData.bank_name,
      };

      this.logger.log('Extracted possible fields:', possibleFields);

      if (!possibleFields.type || possibleFields.type !== 'in') {
        this.logger.warn(
          'Not an incoming transaction. Type:',
          possibleFields.type,
        );
        return { success: false, message: 'Not an incoming transaction' };
      }

      const content = possibleFields.content || '';
      this.logger.log('Transaction content:', content);

      const orderPatterns = [
        /DH(\d+)/i,
        /(?:^|\s)(\d{8,})/,
        /order[:\s]*(\d+)/i,
      ];

      let orderId = null;
      for (const pattern of orderPatterns) {
        const match = content.match(pattern);
        if (match) {
          orderId = match[1];
          this.logger.log(`Found order ID with pattern ${pattern}:`, orderId);
          break;
        }
      }

      if (!orderId) {
        this.logger.error('Order ID not found in content:', content);
        this.logger.log(
          'Tried patterns:',
          orderPatterns.map((p) => p.toString()),
        );
        return { success: false, message: 'Order ID not found in content' };
      }

      this.logger.log('Looking for order:', orderId);
      const order = await this.prisma.product_order.findFirst({
        where: {
          id: BigInt(orderId),
        },
      });

      if (!order) {
        this.logger.error('Order not found in database:', orderId);
        return { success: false, message: 'Order not found' };
      }

      if (order.total === null) {
        this.logger.error('Order total is null:', orderId);
        return { success: false, message: 'Order total is invalid' };
      }

      this.logger.log('Found order:', {
        id: order.id.toString(),
        total: order.total.toString(),
        payment_status: order.payment_status,
        payment_method: order.payment_method,
      });

      if (order.payment_status === 'PAID') {
        this.logger.warn('Order already paid:', orderId);
        return { success: true, message: 'Order already paid' };
      }

      const orderAmount = Number(order.total);
      const webhookAmount = Number(possibleFields.amount);
      const amountDiff = Math.abs(orderAmount - webhookAmount);

      this.logger.log('Amount comparison:', {
        orderAmount,
        webhookAmount,
        difference: amountDiff,
        tolerance: 1000,
      });

      if (amountDiff > 1000) {
        this.logger.error('Amount mismatch exceeds tolerance');
        return {
          success: false,
          message: `Amount mismatch: expected ${orderAmount}, got ${webhookAmount}`,
        };
      }

      this.logger.log('Updating order payment status...');
      await this.updateOrderPaymentStatus(orderId, 'PAID', webhookData);

      this.logger.log('=== WEBHOOK PROCESSING SUCCESS ===');
      return {
        success: true,
        message: 'Payment processed successfully',
        orderId,
        amount: webhookAmount,
      };
    } catch (error) {
      this.logger.error('=== WEBHOOK PROCESSING ERROR ===');
      this.logger.error('Error details:', error.stack);
      return {
        success: false,
        message: `Webhook processing failed: ${error.message}`,
      };
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
      },
    });

    await this.logPaymentEvent(Number(orderId), 'PAYMENT_STATUS_UPDATED', {
      status,
      transactionData,
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

    return { order, logs };
  }
}
