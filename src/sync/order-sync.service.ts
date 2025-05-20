import { Injectable, Logger } from '@nestjs/common';
import { KiotvietService } from '../kiotviet/kiotviet.service';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger(OrderSyncService.name);
  private configService: ConfigService;
  private prisma = new PrismaClient();

  constructor(private readonly kiotVietService: KiotvietService) {}

  async createOrderAndSyncToKiotViet(orderData: any) {
    return await this.prisma.$transaction(async (prisma) => {
      try {
        const newOrder = await prisma.product_order.create({
          data: {
            receiver_full_name: orderData.receiverFullName,
            email: orderData.email,
            phone_number: orderData.phoneNumber,
            address_detail: orderData.addressDetail,
            note: orderData.note,
            price: orderData.price ? BigInt(orderData.price) : null,
            quantity: orderData.quantity,
            status: 'NEW',
            type: orderData.type || 'BUY',
            created_date: new Date(),
          },
        });

        for (const item of orderData.orderItems) {
          const product = await prisma.product.findFirst({
            where: { id: BigInt(item.productId) },
          });

          if (!product) {
            throw new Error(`Product with ID ${item.productId} not found`);
          }

          await prisma.orders.create({
            data: {
              product_id: product.id,
              product_order_id: newOrder.id,
              quantity: item.quantity,
              created_date: new Date(),
            },
          });
        }

        const kiotVietOrderData = this.prepareKiotVietOrderData(
          newOrder,
          orderData.orderItems,
        );
        const kiotVietResponse =
          await this.kiotVietService.createOrder(kiotVietOrderData);

        // 4. Update our order with KiotViet reference
        await prisma.product_order.update({
          where: { id: newOrder.id },
          data: {
            kiotviet_id: kiotVietResponse.id.toString(),
            updated_date: new Date(),
          },
        });

        return {
          success: true,
          orderId: newOrder.id.toString(),
          kiotVietOrderId: kiotVietResponse.id,
        };
      } catch (error) {
        this.logger.error('Error creating order:', error);
        throw error;
      }
    });
  }

  private prepareKiotVietOrderData(order: any, orderItems: any[]) {
    const kiotVietOrderItems = orderItems.map((item) => {
      return {
        productId: item.product.kiotviet_id,
        quantity: item.quantity,
        price: item.product.price,
        note: item.note,
      };
    });

    return {
      branchId: this.configService.get('KIOTVIET_BRANCH_ID'),
      customerId: null,
      customerCode: null,
      description: order.note,
      discount: 0,
      orderDetails: kiotVietOrderItems,
      customerName: order.receiver_full_name,
      customerPhone: order.phone_number,
      customerAddress: order.address_detail,
      deliveryAddress: order.address_detail,
      type: 'WEB_ORDER',
    };
  }
}
