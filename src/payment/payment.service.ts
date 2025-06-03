// src/payment/payment.service.ts - UPDATED for SePay webhooks
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SepayService, SepayWebhookPayload } from './sepay.service';
import {
  CreatePaymentDto,
  PaymentMethod,
  PaymentStatus,
  SepayWebhookDto,
} from './dto/create-payment.dto';
import { getInlineHTML } from '../utils/helper';

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
    qrCodeData?: string;
    bankInfo?: any;
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

        // Only check price for non-COD payments
        if (
          paymentMethod !== PaymentMethod.COD &&
          Number(product.price) !== item.price
        ) {
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
          html_content: getInlineHTML(
            cartItems.map((item) => ({
              ...item,
              quantity: item.quantity,
              imagesUrl: [], // Will be populated if needed
            })),
          ),
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

      // For SePay payments, generate VietQR
      const orderInfo = `Thanh toan don hang ${orderCode}`;

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

      // Store SePay order code mapping for webhook processing
      await this.prisma.product_order.update({
        where: { id: productOrder.id },
        data: {
          note: `${productOrder.note || ''}\nSePay Order Code: ${orderCode}`.trim(),
          updated_date: new Date(),
        },
      });

      this.logger.log(`SePay payment order created successfully: ${orderCode}`);

      return {
        success: true,
        orderId: productOrder.id.toString(),
        qrCodeUrl: sepayResponse.data?.qrCodeUrl,
        qrCodeData: sepayResponse.data?.qrCodeData,
        bankInfo: sepayResponse.data?.bankInfo,
        message: 'Payment order created successfully - scan QR code to pay',
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

      // Map database status to PaymentStatus enum
      let status: PaymentStatus;
      switch (order.status) {
        case 'PAID':
        case 'COMPLETED':
          status = PaymentStatus.SUCCESS;
          break;
        case 'CANCELLED':
        case 'FAILED':
          status = PaymentStatus.FAILED;
          break;
        case 'PROCESSING':
          status = PaymentStatus.PROCESSING;
          break;
        default:
          status = PaymentStatus.PENDING;
      }

      return {
        success: true,
        status,
        orderId,
        amount: Number(order.price),
        paymentMethod: order.type || 'UNKNOWN',
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
  async handleSepayWebhook(
    webhookData: SepayWebhookPayload,
    headers: Record<string, string>,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      this.logger.log(
        `Processing SePay webhook for transaction ID: ${webhookData.id}`,
      );

      // Verify webhook signature
      const isValidSignature =
        this.sepayService.verifyWebhookSignature(headers);

      if (!isValidSignature) {
        this.logger.error('Invalid webhook signature');
        return {
          success: false,
          message: 'Invalid webhook signature',
        };
      }

      // Process webhook payload
      const webhookResult =
        this.sepayService.processWebhookPayload(webhookData);

      if (!webhookResult.success) {
        this.logger.error(
          `Webhook payload processing failed: ${webhookResult.message}`,
        );
        return {
          success: false,
          message: webhookResult.message,
        };
      }

      const { orderCode, amount, transactionId } = webhookResult;

      // Find order by order code (stored in note field)
      const order = await this.prisma.product_order.findFirst({
        where: {
          note: {
            contains: `SePay Order Code: ${orderCode}`,
          },
          status: {
            in: ['PENDING', 'PROCESSING'],
          },
        },
      });

      if (!order) {
        this.logger.error(`Order not found for SePay order code: ${orderCode}`);
        return {
          success: false,
          message: 'Order not found',
        };
      }

      // Verify amount matches
      if (Number(order.price) !== amount) {
        this.logger.error(
          `Amount mismatch for order ${orderCode}: expected ${order.price}, received ${amount}`,
        );
        return {
          success: false,
          message: 'Amount mismatch',
        };
      }

      // Check for duplicate transaction
      const existingTransaction = await this.prisma.product_order.findFirst({
        where: {
          note: {
            contains: `Transaction ID: ${transactionId}`,
          },
        },
      });

      if (existingTransaction) {
        this.logger.warn(
          `Duplicate webhook for transaction ${transactionId}, order ${orderCode}`,
        );
        return {
          success: true,
          message: 'Duplicate webhook - already processed',
        };
      }

      // Update order status to paid
      await this.prisma.product_order.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          note: `${order.note || ''}\nTransaction ID: ${transactionId}\nPaid at: ${webhookData.transactionDate}`.trim(),
          updated_date: new Date(),
        },
      });

      this.logger.log(
        `Order ${orderCode} marked as paid. Transaction ID: ${transactionId}`,
      );

      // Here you could add additional logic like:
      // - Send confirmation email
      // - Update inventory
      // - Trigger fulfillment process

      return {
        success: true,
        message: 'Payment processed successfully',
      };
    } catch (error) {
      this.logger.error('Failed to process SePay webhook:', error.message);
      return {
        success: false,
        message: `Webhook processing failed: ${error.message}`,
      };
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
          code: 'cod',
          name: 'Thanh toán khi nhận hàng',
          type: 'offline',
          enabled: true,
        },
      ];

      // Add SePay methods if available
      if (sepayMethods.success && sepayMethods.methods) {
        methods.push(...sepayMethods.methods);
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
   * Verify payment (for manual verification if needed)
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

      // Check if the transaction ID is in the order notes
      const isVerified =
        order.note?.includes(`Transaction ID: ${transactionId}`) || false;

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
          : 'Payment verification failed - transaction ID not found',
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
