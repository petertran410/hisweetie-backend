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
      if (paymentMethod === 'sepay_bank') {
        const cancelledCount = await this.prisma.product_order.updateMany({
          where: {
            OR: [{ phone: customerInfo.phone }, { email: customerInfo.email }],
            payment_method: 'sepay_bank',
            payment_status: 'PENDING',
          },
          data: {
            status: 'CANCELLED',
            payment_status: 'CANCELLED',
            updated_date: new Date(),
            updated_by: 'SYSTEM_AUTO_CANCEL',
          },
        });

        if (cancelledCount.count > 0) {
          this.logger.log(
            `Cancelled ${cancelledCount.count} pending orders for user: ${customerInfo.phone || customerInfo.email}`,
          );
        }
      }

      const order = await this.prisma.product_order.create({
        data: {
          total: BigInt(amounts.total),
          created_date: new Date(),
          full_name: customerInfo.fullName,
          email: customerInfo.email,
          phone: customerInfo.phone,
          address: customerInfo.address,
          detailed_address: customerInfo.detailedAddress,
          province: customerInfo.province,
          district: customerInfo.district,
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
        select: {
          id: true,
          payment_status: true,
          status: true,
          total: true,
          order_kiot_id: true,
          order_kiot_code: true,
          created_date: true,
        },
      });

      if (!order) {
        return {
          success: false,
          status: 'NOT_FOUND',
          message: 'Order not found',
        };
      }

      return {
        success: order.payment_status === 'PAID',
        status:
          order.payment_status === 'PAID' ? 'SUCCESS' : order.payment_status,
        orderId: orderId,
        orderKiotCode: order.order_kiot_code,
        amount: Number(order.total),
        message:
          order.payment_status === 'PAID'
            ? 'Payment successful'
            : 'Payment pending',
      };
    } catch (error) {
      this.logger.error('Error checking payment status:', error);
      return {
        success: false,
        status: 'ERROR',
        message: error.message,
      };
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

        const clientUser = await this.prisma.client_user.findFirst({
          where: {
            OR: [{ phone: order.phone }, { email: order.email || undefined }],
          },
        });

        let kiotCustomerId: number;
        let kiotCustomerCode: string;

        if (clientUser && clientUser.kiotviet_customer_id) {
          this.logger.log(
            `Using existing KiotViet customer ID: ${clientUser.kiotviet_customer_id}`,
          );
          kiotCustomerId = clientUser.kiotviet_customer_id;
          kiotCustomerCode = clientUser.kiot_code || '';
        } else {
          this.logger.log(
            'No KiotViet customer found, creating new customer...',
          );
          const kiotCustomer = await this.kiotVietService.createCustomer({
            name: order.full_name,
            phone: order.phone,
            email: order.email || undefined,
            address: order.detailed_address || undefined,
            province: order.province || undefined,
            ward: order.ward || undefined,
            district: order.district || undefined,
          });

          kiotCustomerId = kiotCustomer.id;
          kiotCustomerCode = kiotCustomer.code;

          if (clientUser) {
            await this.prisma.client_user.update({
              where: { client_id: clientUser.client_id },
              data: {
                kiotviet_customer_id: kiotCustomerId,
                kiot_code: kiotCustomerCode,
              },
            });
          }
        }

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

        const fullAddress = [
          order.detailed_address,
          order.ward,
          order.district,
          order.province,
        ]
          .filter(Boolean)
          .join(', ');

        const locationName = [order.province, order.district]
          .filter(Boolean)
          .join(' - ');

        const kiotOrder = await this.kiotVietService.createOrder({
          customerId: kiotCustomerId,
          customerName: order.full_name,
          items: kiotOrderItems,
          total: Number(order.total),
          description: order.note
            ? `Đơn hàng web #${orderId} - ${order.note}`
            : `Đơn hàng web #${orderId}`,
        });

        this.logger.log(
          `✅ Created KiotViet order: ${kiotOrder.code} for customer: ${kiotCustomerId}`,
        );

        await this.prisma.product_order.update({
          where: { id: BigInt(orderId) },
          data: {
            order_kiot_id: kiotOrder.id,
            order_kiot_code: kiotOrder.code,
          },
        });

        await this.prisma.payment_logs.create({
          data: {
            order_id: BigInt(orderId),
            event_type: 'KIOTVIET_SYNC_SUCCESS',
            event_data: {
              kiotCustomerId,
              kiotCustomerCode,
              kiotOrder,
              items: kiotOrderItems,
              deliveryInfo: {
                receiver: order.full_name,
                contactNumber: order.phone,
                address: fullAddress,
              },
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
            user_agent: 'WEBHOOK_ERROR',
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
