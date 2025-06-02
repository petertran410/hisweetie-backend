// src/payment/payment.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SepayService } from './sepay.service';
import {
  CreatePaymentDto,
  PaymentMethod,
  PaymentStatus,
  SepayWebhookDto,
} from './dto/create-payment.dto';
import { getInlineHTML } from '../utils/helper';

interface PaymentOrder {
  id: string;
  orderId: string;
  status: PaymentStatus;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionId?: string;
  sepayOrderCode?: string;
  customerInfo: any;
  cartItems: any[];
  createdDate: Date;
  updatedDate: Date;
  gatewayResponse?: any;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly prisma = new PrismaClient();

  constructor(private readonly sepayService: SepayService) {}

  /**
   * Generate unique order code
   */
  private generateOrderCode(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `DT${timestamp.slice(-8)}${random}`;
  }

  /**
   * Create payment order
   */
  async createPayment(createPaymentDto: CreatePaymentDto): Promise<{
    success: boolean;
    orderId?: string;
    paymentUrl?: string;
    qrCodeUrl?: string;
    message: string;
  }> {
    try {
      this.logger.log('Creating new payment order');

      const { customerInfo, cartItems, paymentMethod, amounts } =
        createPaymentDto;

      // Validate cart items
      if (!cartItems || cartItems.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      // Verify products exist and prices are correct
      for (const item of cartItems) {
        const product = await this.prisma.product.findUnique({
          where: { id: BigInt(item.productId) },
        });

        if (!product) {
          throw new BadRequestException(`Product ${item.productId} not found`);
        }

        if (Number(product.price) !== item.price) {
          throw new BadRequestException(
            `Price mismatch for product ${item.productId}`,
          );
        }
      }

      // Generate order code
      const orderCode = this.generateOrderCode();

      // Create order in database first
      const productOrder = await this.prisma.product_order.create({
        data: {
          receiver_full_name: customerInfo.fullName,
          email: customerInfo.email,
          phone_number: customerInfo.phone,
          address_detail: customerInfo.address,
          note: customerInfo.note || '',
          price: BigInt(amounts.total),
          quantity: cartItems.reduce((sum, item) => sum + item.quantity, 0),
          status: 'PENDING',
          type: 'BUY',
          html_content: getInlineHTML(cartItems),
          created_date: new Date(),
          updated_date: new Date(),
        },
      });

      // Create order items
      for (const item of cartItems) {
        await this.prisma.orders.create({
          data: {
            product_id: BigInt(item.productId),
            product_order_id: productOrder.id,
            quantity: item.quantity,
            created_date: new Date(),
          },
        });
      }

      // Handle COD orders
      if (paymentMethod === PaymentMethod.COD) {
        await this.prisma.product_order.update({
          where: { id: productOrder.id },
          data: { status: 'PROCESSING' },
        });

        this.logger.log(`COD order created successfully: ${orderCode}`);
        return {
          success: true,
          orderId: productOrder.id.toString(),
          message: 'COD order created successfully',
        };
      }

      // Create SePay payment for online methods
      const orderInfo = `Thanh toán đơn hàng ${orderCode} - ${cartItems.length} sản phẩm`;

      const sepayResponse = await this.sepayService.createPayment({
        orderCode,
        amount: amounts.total,
        orderInfo,
        customerInfo: {
          fullName: customerInfo.fullName,
          email: customerInfo.email,
          phone: customerInfo.phone,
        },
        paymentMethod:
          paymentMethod === PaymentMethod.SEPAY_BANK ? 'BANK' : 'MOMO',
      });

      if (!sepayResponse.success) {
        // Update order status to failed
        await this.prisma.product_order.update({
          where: { id: productOrder.id },
          data: { status: 'FAILED' },
        });

        throw new BadRequestException(
          `Payment creation failed: ${sepayResponse.message}`,
        );
      }

      // Update order with SePay information
      await this.prisma.product_order.update({
        where: { id: productOrder.id },
        data: {
          status: 'PENDING',
          updated_date: new Date(),
        },
      });

      this.logger.log(`Payment order created successfully: ${orderCode}`);

      return {
        success: true,
        orderId: productOrder.id.toString(),
        paymentUrl: sepayResponse.data?.paymentUrl,
        qrCodeUrl: sepayResponse.data?.qrCodeUrl,
        message: 'Payment order created successfully',
      };
    } catch (error) {
      this.logger.error('Failed to create payment order:', error.message);
      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(orderId: string): Promise<{
    success: boolean;
    status: PaymentStatus;
    orderId: string;
    amount: number;
    paymentMethod: string;
    transactionId?: string;
    message: string;
  }> {
    try {
      this.logger.log(`Getting payment status for order: ${orderId}`);

      const order = await this.prisma.product_order.findUnique({
        where: { id: BigInt(orderId) },
      });

      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      let status = order.status as PaymentStatus;
      let transactionId: string | undefined;

      // For online payments, check with SePay
      if (order.type === 'BUY' && status === 'PENDING') {
        // Note: You'd need to store the SePay order code in your database
        // For now, we'll use the order ID as the order code
        const sepayStatus = await this.sepayService.checkPaymentStatus(orderId);

        if (sepayStatus.success) {
          if (
            sepayStatus.status === 'SUCCESS' ||
            sepayStatus.status === 'PAID'
          ) {
            status = PaymentStatus.SUCCESS;
            transactionId = sepayStatus.transactionId;

            // Update order status
            await this.prisma.product_order.update({
              where: { id: BigInt(orderId) },
              data: {
                status: 'PAID',
                updated_date: new Date(),
              },
            });
          } else if (
            sepayStatus.status === 'FAILED' ||
            sepayStatus.status === 'CANCELLED'
          ) {
            status = PaymentStatus.FAILED;

            await this.prisma.product_order.update({
              where: { id: BigInt(orderId) },
              data: {
                status: 'CANCELLED',
                updated_date: new Date(),
              },
            });
          }
        }
      }

      return {
        success: true,
        status,
        orderId,
        amount: Number(order.price),
        paymentMethod: order.type || 'UNKNOWN',
        transactionId,
        message: 'Payment status retrieved successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to get payment status for ${orderId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Handle SePay webhook
   */
  async handleSepayWebhook(webhookData: SepayWebhookDto): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      this.logger.log(
        `Processing SePay webhook for order: ${webhookData.orderCode}`,
      );

      // Verify webhook signature
      const isValidSignature = this.sepayService.verifyWebhookSignature(
        webhookData,
        webhookData.signature,
      );

      if (!isValidSignature) {
        this.logger.error('Invalid webhook signature');
        throw new BadRequestException('Invalid webhook signature');
      }

      // Find order by order code (you'll need to implement this mapping)
      const order = await this.prisma.product_order.findFirst({
        where: {
          // You'd need to store the SePay order code in your database
          // For now, we'll search by the order code in a note or custom field
        },
      });

      if (!order) {
        this.logger.error(
          `Order not found for webhook: ${webhookData.orderCode}`,
        );
        return {
          success: false,
          message: 'Order not found',
        };
      }

      // Update order status based on webhook
      let newStatus = 'PENDING';
      if (webhookData.status === 'SUCCESS' || webhookData.status === 'PAID') {
        newStatus = 'PAID';
      } else if (
        webhookData.status === 'FAILED' ||
        webhookData.status === 'CANCELLED'
      ) {
        newStatus = 'CANCELLED';
      }

      await this.prisma.product_order.update({
        where: { id: order.id },
        data: {
          status: newStatus,
          updated_date: new Date(),
        },
      });

      this.logger.log(
        `Order ${webhookData.orderCode} status updated to ${newStatus}`,
      );

      // Send confirmation email or notification here if needed

      return {
        success: true,
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      this.logger.error('Failed to process SePay webhook:', error.message);
      throw error;
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(orderId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      this.logger.log(`Cancelling payment for order: ${orderId}`);

      const order = await this.prisma.product_order.findUnique({
        where: { id: BigInt(orderId) },
      });

      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      if (order.status === 'PAID') {
        throw new BadRequestException('Cannot cancel paid order');
      }

      // Cancel with SePay if it's an online payment
      if (order.type === 'BUY' && order.status === 'PENDING') {
        await this.sepayService.cancelPayment(orderId);
      }

      // Update order status
      await this.prisma.product_order.update({
        where: { id: BigInt(orderId) },
        data: {
          status: 'CANCELLED',
          updated_date: new Date(),
        },
      });

      return {
        success: true,
        message: 'Payment cancelled successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to cancel payment for ${orderId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get payment methods
   */
  async getPaymentMethods(): Promise<{
    success: boolean;
    methods: Array<{
      code: string;
      name: string;
      type: string;
      enabled: boolean;
    }>;
  }> {
    try {
      // Get SePay payment methods
      const sepayMethods = await this.sepayService.getPaymentMethods();

      const methods = [
        {
          code: 'sepay_bank',
          name: 'Chuyển khoản ngân hàng',
          type: 'online',
          enabled: true,
        },
        {
          code: 'sepay_momo',
          name: 'Ví MoMo',
          type: 'online',
          enabled: true,
        },
        {
          code: 'cod',
          name: 'Thanh toán khi nhận hàng',
          type: 'offline',
          enabled: true,
        },
      ];

      // Add SePay methods if available
      if (sepayMethods.success && sepayMethods.methods) {
        sepayMethods.methods.forEach((method) => {
          if (!methods.find((m) => m.code === method.code)) {
            methods.push({
              code: method.code,
              name: method.name,
              type: method.type,
              enabled: method.enabled,
            });
          }
        });
      }

      return {
        success: true,
        methods,
      };
    } catch (error) {
      this.logger.error('Failed to get payment methods:', error.message);
      return {
        success: true,
        methods: [
          {
            code: 'cod',
            name: 'Thanh toán khi nhận hàng',
            type: 'offline',
            enabled: true,
          },
        ],
      };
    }
  }

  /**
   * Verify payment
   */
  async verifyPayment(
    orderId: string,
    transactionId: string,
  ): Promise<{
    success: boolean;
    verified: boolean;
    message: string;
  }> {
    try {
      this.logger.log(`Verifying payment for order: ${orderId}`);

      const order = await this.prisma.product_order.findUnique({
        where: { id: BigInt(orderId) },
      });

      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      // Check with SePay
      const sepayStatus = await this.sepayService.checkPaymentStatus(orderId);

      const isVerified =
        sepayStatus.success &&
        (sepayStatus.status === 'SUCCESS' || sepayStatus.status === 'PAID') &&
        sepayStatus.transactionId === transactionId;

      if (isVerified && order.status !== 'PAID') {
        await this.prisma.product_order.update({
          where: { id: BigInt(orderId) },
          data: {
            status: 'PAID',
            updated_date: new Date(),
          },
        });
      }

      return {
        success: true,
        verified: isVerified,
        message: isVerified
          ? 'Payment verified successfully'
          : 'Payment verification failed',
      };
    } catch (error) {
      this.logger.error(
        `Failed to verify payment for ${orderId}:`,
        error.message,
      );
      throw error;
    }
  }
}
