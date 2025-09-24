import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SepayService } from './sepay.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { KiotVietService } from 'src/kiotviet/kiotviet.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private sepayService: SepayService,
    private kiotVietService: KiotVietService,
  ) {}

  async createOrder(createPaymentDto: CreatePaymentDto) {
    const { customerInfo, cartItems, paymentMethod, amounts } =
      createPaymentDto;

    try {
      const order = await this.prisma.product_order.create({
        data: {
          total: BigInt(amounts.total),
          created_date: new Date(),
          full_name: customerInfo.fullName,
          email: customerInfo.email,
          phone: customerInfo.phone,
          address: customerInfo.address,
          detailed_address: customerInfo.detailedAddress,
          province_district: customerInfo.provinceDistrict,
          ward: customerInfo.ward,
          note: customerInfo.note || '',
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'cod' ? 'PAID' : 'PENDING',
          status: paymentMethod === 'cod' ? 'CONFIRMED' : 'PENDING',
        },
      });

      for (const item of cartItems) {
        await this.prisma.orders.create({
          data: {
            product_order_id: order.id,
            product_id: BigInt(item.productId),
            quantity: item.quantity,
            created_date: new Date(),
            created_by: 'SYSTEM',
          },
        });
      }

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

      const paymentLog = await this.prisma.payment_logs.findFirst({
        where: {
          order_id: BigInt(orderId),
          event_type: 'PAYMENT_SUCCESS',
        },
        orderBy: { created_date: 'desc' },
      });

      let transactionId: string | null = null;
      let gateway: string | null = null;
      let transactionDate: string | null = null;
      let referenceCode: string | null = null;
      let accountNumber: string | null = null;
      let content: string | null = null;

      if (paymentLog?.event_data && typeof paymentLog.event_data === 'object') {
        const eventData = paymentLog.event_data as any;

        transactionId = eventData?.transactionId
          ? String(eventData.transactionId)
          : null;
        gateway = eventData?.gateway ? String(eventData.gateway) : null;
        transactionDate = eventData?.transactionDate
          ? String(eventData.transactionDate)
          : null;
        referenceCode = eventData?.referenceCode
          ? String(eventData.referenceCode)
          : null;
        accountNumber = eventData?.accountNumber
          ? String(eventData.accountNumber)
          : null;
        content = eventData?.content ? String(eventData.content) : null;
      }

      return {
        success: true,
        status: order.payment_status || 'PENDING',
        orderId,
        amount: order.total ? Number(order.total) : 0,
        paymentMethod: order.payment_method || '',
        orderStatus: order.status || 'PENDING',
        transactionId,
        gateway,
        transactionDate,
        referenceCode,
        accountNumber,
        content,
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
      this.logger.log('=== SEPAY WEBHOOK START ===');
      this.logger.log(
        'Raw webhook data:',
        JSON.stringify(webhookData, null, 2),
      );

      const requiredFields = ['transferType', 'transferAmount', 'content'];
      const missingFields = requiredFields.filter(
        (field) => !webhookData[field],
      );

      if (missingFields.length > 0) {
        this.logger.error('Missing required fields:', missingFields);
        return { success: false, message: 'Missing required fields' };
      }

      const mappedData = {
        transferType: webhookData.transferType,
        transferAmount: parseFloat(webhookData.transferAmount),
        content: webhookData.content || '',
        transactionId: webhookData.id,
        gateway: webhookData.gateway,
        transactionDate: webhookData.transactionDate,
      };

      if (mappedData.transferType !== 'in') {
        return { success: true, message: 'Not an incoming transfer' };
      }

      const orderMatch = mappedData.content.match(/SEVQR[\s+]DHWEB(\d+)/i);
      if (!orderMatch) {
        this.logger.warn('No order ID found in content:', mappedData.content);
        return { success: true, message: 'No order ID found' };
      }

      const orderId = orderMatch[1];
      this.logger.log(`Extracted order ID: ${orderId}`);

      const order = await this.prisma.product_order.findFirst({
        where: {
          id: BigInt(orderId),
          total: mappedData.transferAmount,
          payment_status: 'PENDING',
          payment_method: 'sepay_bank',
        },
        include: {
          orders: {
            include: {
              product: true,
            },
          },
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

      await this.prisma.product_order.update({
        where: { id: BigInt(orderId) },
        data: {
          payment_status: 'PAID',
          status: 'CONFIRMED',
          updated_date: new Date(),
          updated_by: 'SEPAY_WEBHOOK',
        },
      });

      try {
        if (!order.full_name || !order.phone) {
          throw new Error(
            'Missing required customer information (name or phone)',
          );
        }

        const kiotCustomer = await this.kiotVietService.createCustomer({
          name: order.full_name,
          phone: order.phone,
          email: order.email || undefined,
          address: order.detailed_address || undefined,
          provinceDistrict: order.province_district || undefined,
          ward: order.ward || undefined,
        });

        const validOrderItems = order.orders.filter(
          (orderItem) =>
            orderItem.product &&
            orderItem.product.kiotviet_id &&
            orderItem.product.kiotviet_code &&
            orderItem.quantity,
        );

        if (validOrderItems.length === 0) {
          throw new Error('No valid products found for KiotViet sync');
        }

        const kiotOrderItems = validOrderItems.map((orderItem) => ({
          productId: Number(orderItem.product!.kiotviet_id),
          productCode: orderItem.product!.kiotviet_code!,
          productName:
            orderItem.product!.kiotviet_name ||
            orderItem.product!.title ||
            'Sản phẩm',
          quantity: orderItem.quantity!,
          price: Number(orderItem.product!.kiotviet_price || 0),
        }));

        const kiotOrder = await this.kiotVietService.createOrder({
          customerId: kiotCustomer.id,
          customerName: kiotCustomer.name,
          items: kiotOrderItems,
          total: Number(order.total),
          description: `Đơn hàng web #${orderId} - ${order.note || ''}`,
        });

        this.logger.log(
          `✅ Created KiotViet order: ${kiotOrder.code} for customer: ${kiotCustomer.id}`,
        );

        await this.prisma.payment_logs.create({
          data: {
            order_id: BigInt(orderId),
            event_type: 'KIOTVIET_SYNC_SUCCESS',
            event_data: {
              kiotCustomer,
              kiotOrder,
              items: kiotOrderItems,
              validItemsCount: validOrderItems.length,
              totalItemsCount: order.orders.length,
            },
            created_date: new Date(),
            ip_address: 'KIOTVIET_API',
            user_agent: 'WEBHOOK_SYNC',
          },
        });
      } catch (kiotError) {
        this.logger.error('Failed to sync with KiotViet:', kiotError);

        await this.prisma.payment_logs.create({
          data: {
            order_id: BigInt(orderId),
            event_type: 'KIOTVIET_SYNC_ERROR',
            event_data: {
              error: kiotError.message,
              orderData: {
                customerName: order.full_name,
                customerPhone: order.phone,
                itemsCount: order.orders.length,
              },
            },
            created_date: new Date(),
            ip_address: 'KIOTVIET_API',
            user_agent: 'WEBHOOK_SYNC',
          },
        });
      }

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

      this.logger.log(`✅ Order ${orderId} payment confirmed successfully`);
      return {
        success: true,
        message: 'Payment processed successfully',
        orderId,
        amount: mappedData.transferAmount,
      };
    } catch (error) {
      this.logger.error('Webhook processing failed:', error.stack);
      return {
        success: false,
        message: 'Webhook processing failed',
        error: error.message,
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
