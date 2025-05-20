// src/sync/order-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { KiotvietService } from '../kiotviet/kiotviet.service';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger(OrderSyncService.name);
  private prisma = new PrismaClient();

  constructor(
    private readonly kiotVietService: KiotvietService,
    private readonly configService: ConfigService,
  ) {}

  async createOrderAndSyncToKiotViet(orderData: any) {
    return await this.prisma.$transaction(async (prisma) => {
      try {
        // 1. Create order in our system
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

        // 2. Create order items and retrieve product details for KiotViet
        const orderItems = [];
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

          interface KiotVietOrderItem {
            productId: string;
            quantity: number;
            price: number;
            note: string;
          }

          const orderItems: KiotVietOrderItem[] = [];

          if (product.kiotviet_id) {
            orderItems.push({
              productId: product.kiotviet_id,
              quantity: item.quantity,
              price: Number(product.price) || 0,
              note: item.note || '',
            });
          }
        }

        if (orderItems.length > 0) {
          const kiotVietOrderData = {
            branchId: this.configService.get('KIOT_SHOP_NAME'),
            customerId: null,
            customerCode: null,
            description: newOrder.note,
            discount: 0,
            orderDetails: orderItems,
            customerName: newOrder.receiver_full_name,
            customerPhone: newOrder.phone_number,
            customerAddress: newOrder.address_detail,
            deliveryAddress: newOrder.address_detail,
            type: 'WEB_ORDER',
          };

          try {
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
          } catch (kiotVietError) {
            this.logger.error(
              'Failed to create order in KiotViet',
              kiotVietError,
            );
            // We still return success since our order was created
            return {
              success: true,
              orderId: newOrder.id.toString(),
              kiotVietSync: false,
              error: kiotVietError.message,
            };
          }
        }

        return {
          success: true,
          orderId: newOrder.id.toString(),
        };
      } catch (error) {
        this.logger.error('Error creating order:', error);
        throw error;
      }
    });
  }
}
