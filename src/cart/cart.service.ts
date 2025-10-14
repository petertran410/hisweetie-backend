import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async getCart(clientId: number) {
    const cartItems = await this.prisma.cart.findMany({
      where: { client_id: clientId },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            kiotviet_name: true,
            kiotviet_price: true,
            kiotviet_images: true,
            images_url: true,
            is_visible: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const formattedCart = cartItems.map((item) => ({
      id: item.id,
      slug: item.product.slug,
      productId: item.product_id.toString(), // Convert BigInt to String
      quantity: item.quantity,
      product: {
        title: item.product.title || item.product.kiotviet_name,
        price: item.product.kiotviet_price
          ? Number(item.product.kiotviet_price)
          : 0,
        image: item.product.kiotviet_images
          ? Array.isArray(item.product.kiotviet_images)
            ? item.product.kiotviet_images[0]
            : null
          : item.product.images_url,
        isVisible: item.product.is_visible,
      },
    }));

    return {
      items: formattedCart,
      totalItems: formattedCart.length,
    };
  }

  async addToCart(clientId: number, dto: AddToCartDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: BigInt(dto.product_id) },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existingCartItem = await this.prisma.cart.findUnique({
      where: {
        client_id_product_id: {
          client_id: clientId,
          product_id: BigInt(dto.product_id),
        },
      },
    });

    if (existingCartItem) {
      const updatedItem = await this.prisma.cart.update({
        where: { id: existingCartItem.id },
        data: {
          quantity: existingCartItem.quantity + dto.quantity,
          updated_at: new Date(),
        },
      });

      return {
        message: 'Cart updated successfully',
        item: {
          id: updatedItem.id,
          client_id: updatedItem.client_id,
          product_id: updatedItem.product_id.toString(), // Convert BigInt to String
          quantity: updatedItem.quantity,
          created_at: updatedItem.created_at,
          updated_at: updatedItem.updated_at,
        },
      };
    }

    const newItem = await this.prisma.cart.create({
      data: {
        client_id: clientId,
        product_id: BigInt(dto.product_id),
        quantity: dto.quantity,
      },
    });

    return {
      message: 'Added to cart successfully',
      item: {
        id: newItem.id,
        client_id: newItem.client_id,
        product_id: newItem.product_id.toString(), // Convert BigInt to String
        quantity: newItem.quantity,
        created_at: newItem.created_at,
        updated_at: newItem.updated_at,
      },
    };
  }

  async updateCartItem(
    clientId: number,
    cartItemId: number,
    dto: UpdateCartDto,
  ) {
    const cartItem = await this.prisma.cart.findFirst({
      where: {
        id: cartItemId,
        client_id: clientId,
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    const updatedItem = await this.prisma.cart.update({
      where: { id: cartItemId },
      data: {
        quantity: dto.quantity,
        updated_at: new Date(),
      },
    });

    return {
      message: 'Cart updated successfully',
      item: {
        id: updatedItem.id,
        client_id: updatedItem.client_id,
        product_id: updatedItem.product_id.toString(), // Convert BigInt to String
        quantity: updatedItem.quantity,
        created_at: updatedItem.created_at,
        updated_at: updatedItem.updated_at,
      },
    };
  }

  async removeFromCart(clientId: number, cartItemId: number) {
    const cartItem = await this.prisma.cart.findFirst({
      where: {
        id: cartItemId,
        client_id: clientId,
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cart.delete({
      where: { id: cartItemId },
    });

    return { message: 'Item removed from cart successfully' };
  }

  async clearCart(clientId: number) {
    await this.prisma.cart.deleteMany({
      where: { client_id: clientId },
    });

    return { message: 'Cart cleared successfully' };
  }

  async syncCart(
    clientId: number,
    localCart: Array<{ slug: string; id: number; quantity: number }>,
  ) {
    const productIds = localCart.map((item) => BigInt(item.id));

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, slug: true },
    });

    const productMap = new Map(products.map((p) => [p.slug, p.id]));

    for (const item of localCart) {
      const productId = productMap.get(item.slug);
      if (!productId) continue;

      const existingCartItem = await this.prisma.cart.findUnique({
        where: {
          client_id_product_id: {
            client_id: clientId,
            product_id: productId,
          },
        },
      });

      if (existingCartItem) {
        await this.prisma.cart.update({
          where: { id: existingCartItem.id },
          data: {
            quantity: Math.max(existingCartItem.quantity, item.quantity),
            updated_at: new Date(),
          },
        });
      } else {
        await this.prisma.cart.create({
          data: {
            client_id: clientId,
            product_id: productId,
            quantity: item.quantity,
          },
        });
      }
    }

    return this.getCart(clientId);
  }
}
