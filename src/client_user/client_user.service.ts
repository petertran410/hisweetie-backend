import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ClientUserType } from './dto/create-client-user.dto';
import { KiotVietService } from '../kiotviet/kiotviet.service';

@Injectable()
export class ClientUserService {
  constructor(
    private prisma: PrismaService,
    private kiotVietService: KiotVietService,
  ) {}

  async findAll() {
    const data = await this.prisma.client_user.findMany();
    return data;
  }

  async findOne(id: number): Promise<ClientUserType | null> {
    const user = await this.prisma.client_user.findUnique({
      where: { client_id: id },
    });
    return user;
  }

  async findName(clientName: string) {
    const data = await this.prisma.client_user.findMany({
      where: {
        full_name: {
          contains: clientName,
        },
      },
    });
    return data;
  }

  async checkExistence({
    email,
    phone,
  }: ClientUserType): Promise<ClientUserType | null> {
    const client_user = await this.prisma.client_user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });
    return client_user;
  }

  async validate(email: string, password: string) {
    const client_user = await this.prisma.client_user.findFirst({
      where: { email },
    });
    if (client_user && client_user.pass_word) {
      if (await bcrypt.compare(password, client_user.pass_word)) {
        return client_user;
      } else {
        throw new UnauthorizedException('Incorrect email or password!');
      }
    } else {
      return null;
    }
  }

  async create(data: ClientUserType) {
    if (!data.pass_word) {
      throw new Error('Password is required');
    }
    const hashedPassword = await bcrypt.hash(data.pass_word, 10);
    const client_user = await this.prisma.client_user.create({
      data: { ...data, pass_word: hashedPassword },
    });
    return client_user;
  }

  async update(client_id: number, data: Partial<ClientUserType>) {
    const existingUser = await this.prisma.client_user.findUnique({
      where: { client_id },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${client_id} not found`);
    }

    if (data.email || data.phone) {
      const conflictUser = await this.prisma.client_user.findFirst({
        where: {
          AND: [
            { client_id: { not: client_id } },
            {
              OR: [
                data.email ? { email: data.email } : {},
                data.phone ? { phone: data.phone } : {},
              ],
            },
          ],
        },
      });

      if (conflictUser) {
        throw new ConflictException(
          'User with this email or phone already exists',
        );
      }
    }

    const updatedUser = await this.prisma.client_user.update({
      where: { client_id },
      data,
    });

    if (existingUser.kiotviet_customer_id) {
      try {
        await this.kiotVietService.updateCustomer(
          existingUser.kiotviet_customer_id,
          {
            name: data.full_name || existingUser.full_name || undefined,
            phone: data.phone || existingUser.phone || undefined,
            email: data.email || existingUser.email || undefined,
            address:
              data.detailed_address ||
              existingUser.detailed_address ||
              undefined,
            province: data.province || existingUser.province || undefined,
            district: data.district || existingUser.district || undefined,
            ward: data.ward || existingUser.ward || undefined,
          },
        );
      } catch (error) {
        console.error('Failed to update Kiot customer:', error.message);
      }
    }

    return updatedUser;
  }

  async changePassword(
    id: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<ClientUserType | Error> {
    const user = await this.prisma.client_user.findUnique({
      where: { client_id: id },
    });
    if (user && user.pass_word) {
      if (await bcrypt.compare(oldPassword, user.pass_word)) {
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        const updatedUser = await this.prisma.client_user.update({
          where: { client_id: id },
          data: { pass_word: hashedNewPassword },
        });
        return updatedUser;
      } else {
        throw new UnauthorizedException('Incorrect password!');
      }
    } else {
      throw new NotFoundException();
    }
  }

  async delete(id: number): Promise<ClientUserType | Error> {
    const isExisted = await this.findOne(id);
    if (isExisted) {
      const user = await this.prisma.client_user.delete({
        where: { client_id: id },
      });
      return user;
    } else throw new NotFoundException();
  }

  async getMyOrders(
    clientId: number,
    page: number = 1,
    limit: number = 10,
    status?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {
      client_user_id: clientId,
    };

    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      this.prisma.product_order.findMany({
        where,
        include: {
          orders: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  kiotviet_name: true,
                  kiotviet_price: true,
                  kiotviet_images: true,
                  images_url: true,
                },
              },
            },
          },
        },
        orderBy: { created_date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.product_order.count({ where }),
    ]);

    const formattedOrders = orders.map((order) => ({
      id: order.id.toString(),
      order_kiot_id: order.order_kiot_id,
      orderCode: order.order_kiot_code || `DH${order.id}`,
      fullName: order.full_name,
      phone: order.phone,
      email: order.email,
      address: [
        order.detailed_address,
        order.ward,
        order.district,
        order.province,
      ]
        .filter(Boolean)
        .join(', '),
      total: Number(order.total),
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      createdDate: order.created_date,
      items: order.orders.map((item) => ({
        productId: item.product_id?.toString(),
        productName:
          item.product?.title || item.product?.kiotviet_name || 'Sản phẩm',
        quantity: item.quantity,
        price: item.product?.kiotviet_price
          ? Number(item.product.kiotviet_price)
          : 0,
        image: item.product?.kiotviet_images
          ? Array.isArray(item.product.kiotviet_images)
            ? item.product.kiotviet_images[0]
            : null
          : item.product?.images_url
            ? JSON.parse(item.product.images_url)[0]
            : null,
      })),
    }));

    return {
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async cancelOrder(clientId: number, orderId: string) {
    const order = await this.prisma.product_order.findFirst({
      where: {
        id: BigInt(orderId),
        client_user_id: clientId,
      },
      select: {
        id: true,
        order_kiot_id: true,
        status: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Order already cancelled');
    }

    if (!order.order_kiot_id) {
      throw new BadRequestException('No KiotViet order to cancel');
    }

    await this.kiotVietService.deleteOrder(order.order_kiot_id);

    await this.prisma.product_order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        updated_date: new Date(),
      },
    });

    return {
      success: true,
      message: 'Order cancelled successfully',
    };
  }

  async getOrderDetail(clientId: number, orderId: string) {
    const order = await this.prisma.product_order.findFirst({
      where: {
        id: BigInt(orderId),
        client_user_id: clientId,
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
      throw new NotFoundException('Order not found');
    }

    return {
      id: order.id.toString(),
      orderCode: order.order_kiot_code || `DH${order.id}`,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      total: Number(order.total),
      fullName: order.full_name,
      phone: order.phone,
      email: order.email,
      address: [
        order.detailed_address,
        order.ward,
        order.district,
        order.province,
      ]
        .filter(Boolean)
        .join(', '),
      createdDate: order.created_date,
      items: order.orders.map((item) => ({
        productId: item.product_id?.toString(),
        productName: item.product?.title || item.product?.kiotviet_name,
        quantity: item.quantity,
        price: Number(item.product?.kiotviet_price || 0),
        image: Array.isArray(item.product?.kiotviet_images)
          ? item.product.kiotviet_images[0]
          : null,
      })),
    };
  }
}
