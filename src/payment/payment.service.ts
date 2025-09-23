import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SepayService } from './sepay.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private sepayService: SepayService,
  ) {}

  async createOrder(createOrderDto: CreateOrderDto) {
    const { customerInfo, cartItems, paymentMethod, amounts } = createOrderDto;

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
      throw new BadRequestException('Failed to create order');
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
      throw error;
    }
  }

  async handleWebhook(webhookData: any) {
    try {
      const { content, transferAmount, transferType, referenceCode } =
        webhookData;

      if (transferType !== 'in') {
        return { success: false, message: 'Not an incoming transaction' };
      }

      const orderMatch = content.match(/DH(\d+)/);
      if (!orderMatch) {
        return { success: false, message: 'Order ID not found in content' };
      }

      const orderId = orderMatch[1];
      const order = await this.prisma.product_order.findFirst({
        where: {
          id: BigInt(orderId),
          total: BigInt(transferAmount),
          payment_status: 'PENDING',
        },
      });

      if (!order) {
        return { success: false, message: 'Order not found or already paid' };
      }

      await this.updateOrderPaymentStatus(orderId, 'PAID', webhookData);

      return { success: true, message: 'Payment processed successfully' };
    } catch (error) {
      this.logger.error('Webhook processing failed:', error);
      throw error;
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
    await this.prisma.payment_logs.create({
      data: {
        order_id: BigInt(orderId),
        event_type: eventType,
        event_data: eventData,
        created_date: new Date(),
      },
    });
  }
}
