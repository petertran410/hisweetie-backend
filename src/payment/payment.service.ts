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
   * Create payment order - FIXED VERSION
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

      // Generate SePay order code FIRST
      const sepayOrderCode = this.generateOrderCode();

      // Create order in database with SePay order code
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
          payment_method: paymentMethod,
          payment_status: 'PENDING',
          sepay_order_code: sepayOrderCode, // CRITICAL: Store in dedicated field
          subtotal: BigInt(amounts.subtotal),
          shipping_cost: BigInt(amounts.shipping),
          total_amount: BigInt(amounts.total),
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

      this.logger.log(
        `Order created: DB ID ${productOrder.id}, SePay Code: ${sepayOrderCode}`,
      );

      // Handle COD orders
      if (paymentMethod === PaymentMethod.COD) {
        await this.prisma.product_order.update({
          where: { id: productOrder.id },
          data: {
            status: 'PROCESSING',
            payment_status: 'PENDING',
          },
        });

        this.logger.log(`COD order created successfully: ${sepayOrderCode}`);
        return {
          success: true,
          orderId: productOrder.id.toString(),
          message: 'COD order created successfully',
        };
      }

      // For SePay payments, generate VietQR
      const orderInfo = `Thanh toan don hang ${sepayOrderCode}`;

      const sepayResponse = await this.sepayService.createPayment({
        orderCode: sepayOrderCode, // Use the generated SePay order code
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
          data: {
            status: 'FAILED',
            payment_status: 'FAILED',
          },
        });

        throw new BadRequestException(
          `Payment creation failed: ${sepayResponse.message}`,
        );
      }

      // Update order with payment URL and QR info
      await this.prisma.product_order.update({
        where: { id: productOrder.id },
        data: {
          payment_url: sepayResponse.data?.qrCodeUrl,
          qr_code_url: sepayResponse.data?.qrCodeUrl,
          payment_gateway_response: sepayResponse.data as any,
          updated_date: new Date(),
        },
      });

      this.logger.log(
        `SePay payment order created successfully: ${sepayOrderCode}`,
      );

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
   * Handle SePay webhook - FIXED VERSION with proper null checks
   */
  async handleSepayWebhook(
    webhookData: SepayWebhookPayload,
    headers: Record<string, string>,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      this.logger.log(`=== PROCESSING SEPAY WEBHOOK ===`);
      this.logger.log(`Transaction ID: ${webhookData.id}`);
      this.logger.log(`Gateway: ${webhookData.gateway}`);
      this.logger.log(`Amount: ${webhookData.transferAmount}`);
      this.logger.log(`Content: ${webhookData.content}`);
      this.logger.log(`Code: ${webhookData.code}`);

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

      // FIXED: Proper null checks for extracted data
      const { orderCode, amount, transactionId } = webhookResult;

      if (!orderCode) {
        this.logger.error('No order code extracted from webhook');
        return {
          success: false,
          message: 'No order code found in webhook',
        };
      }

      if (!amount || !transactionId) {
        this.logger.error('Missing amount or transaction ID in webhook');
        return {
          success: false,
          message: 'Missing required webhook data',
        };
      }

      this.logger.log(`Extracted order code: ${orderCode}`);
      this.logger.log(`Transaction amount: ${amount}`);

      // FIXED: Find order by sepay_order_code field with proper null handling
      let order = await this.prisma.product_order.findFirst({
        where: {
          sepay_order_code: orderCode,
          payment_status: {
            in: ['PENDING', 'PROCESSING'],
          },
        },
      });

      if (!order) {
        this.logger.error(`Order not found for SePay order code: ${orderCode}`);

        // Try to find by database ID for backward compatibility
        const orderById = await this.prisma.product_order.findFirst({
          where: {
            id: BigInt(orderCode),
            payment_status: {
              in: ['PENDING', 'PROCESSING'],
            },
          },
        });

        if (!orderById) {
          this.logger.error(`Order not found by ID either: ${orderCode}`);
          return {
            success: false,
            message: 'Order not found',
          };
        }

        this.logger.log(`Found order by database ID: ${orderById.id}`);

        // Update this order to use the proper sepay_order_code
        await this.prisma.product_order.update({
          where: { id: orderById.id },
          data: {
            sepay_order_code: orderCode,
          },
        });

        // Use the found order
        order = orderById;
      }

      // FIXED: order is now guaranteed to be non-null due to the checks above
      this.logger.log(
        `Found order: ID ${order.id}, Amount ${order.total_amount || order.price}`,
      );

      // Verify amount matches (use total_amount if available, fallback to price)
      const orderAmount = Number(order.total_amount || order.price);
      if (orderAmount !== amount) {
        this.logger.error(
          `Amount mismatch for order ${orderCode}: expected ${orderAmount}, received ${amount}`,
        );
        return {
          success: false,
          message: 'Amount mismatch',
        };
      }

      // Check for duplicate transaction
      const existingTransaction = await this.prisma.product_order.findFirst({
        where: {
          transaction_id: transactionId,
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
          payment_status: 'PAID',
          transaction_id: transactionId,
          payment_completed_at: new Date(webhookData.transactionDate),
          updated_date: new Date(),
        },
      });

      // Log the payment in payment_logs
      await this.prisma.payment_logs.create({
        data: {
          order_id: order.id,
          event_type: 'PAYMENT_SUCCESS',
          event_data: {
            transactionId: transactionId,
            amount: amount,
            gateway: webhookData.gateway,
            orderCode: orderCode,
          },
          sepay_response: webhookData as any,
          created_date: new Date(),
        },
      });

      this.logger.log(
        `✅ Order ${orderCode} marked as paid. Transaction ID: ${transactionId}`,
      );

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
   * Get payment status - ENHANCED with proper null handling
   */
  async getPaymentStatus(orderId: string): Promise<{
    success: boolean;
    status: PaymentStatus;
    orderId: string;
    amount: number;
    paymentMethod: string;
    transactionId?: string;
    sepayOrderCode?: string;
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
      switch (order.payment_status || order.status) {
        case 'PAID':
        case 'SUCCESS':
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

      // FIXED: Convert null to undefined for return type compatibility
      return {
        success: true,
        status,
        orderId,
        amount: Number(order.total_amount || order.price),
        paymentMethod: order.payment_method || order.type || 'UNKNOWN',
        transactionId: order.transaction_id || undefined, // Convert null to undefined
        sepayOrderCode: order.sepay_order_code || undefined, // Convert null to undefined
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
   * Debug: List all pending orders for troubleshooting
   */
  async listPendingOrders(): Promise<any[]> {
    try {
      const orders = await this.prisma.product_order.findMany({
        where: {
          payment_status: {
            in: ['PENDING', 'PROCESSING'],
          },
        },
        select: {
          id: true,
          sepay_order_code: true,
          payment_status: true,
          status: true,
          total_amount: true,
          price: true,
          created_date: true,
        },
        take: 20,
        orderBy: {
          created_date: 'desc',
        },
      });

      return orders.map((order) => ({
        id: order.id.toString(),
        sepayOrderCode: order.sepay_order_code || undefined, // Convert null to undefined
        paymentStatus: order.payment_status,
        status: order.status,
        amount: Number(order.total_amount || order.price),
        createdDate: order.created_date,
      }));
    } catch (error) {
      this.logger.error('Failed to list pending orders:', error.message);
      return [];
    }
  }

  async cancelPayment(
    orderId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Cancelling payment for order: ${orderId}`);

      const order = await this.prisma.product_order.findUnique({
        where: { id: BigInt(orderId) },
      });

      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      if (order.payment_status === 'PAID' || order.status === 'PAID') {
        throw new BadRequestException('Cannot cancel paid order');
      }

      await this.prisma.product_order.update({
        where: { id: BigInt(orderId) },
        data: {
          status: 'CANCELLED',
          payment_status: 'CANCELLED',
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
      const sepayMethods = await this.sepayService.getPaymentMethods();

      const methods = [
        {
          code: 'cod',
          name: 'Thanh toán khi nhận hàng',
          type: 'offline',
          enabled: true,
        },
      ];

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

      const isVerified = order.transaction_id === transactionId;

      if (isVerified && order.payment_status !== 'PAID') {
        await this.prisma.product_order.update({
          where: { id: BigInt(orderId) },
          data: {
            status: 'PAID',
            payment_status: 'PAID',
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
