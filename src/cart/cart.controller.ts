import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { ClientJwtAuthGuard } from '../auth/client-auth/client-jwt-auth.guard';
import { CurrentClient } from '../auth/client-auth/current-client.decorator';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';

@ApiTags('cart')
@Controller('cart')
@UseGuards(ClientJwtAuthGuard)
@ApiBearerAuth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get user cart' })
  async getCart(@CurrentClient() client: any) {
    return this.cartService.getCart(client.clientId);
  }

  @Post('add')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add product to cart' })
  async addToCart(@CurrentClient() client: any, @Body() dto: AddToCartDto) {
    return this.cartService.addToCart(client.clientId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update cart item quantity' })
  async updateCartItem(
    @CurrentClient() client: any,
    @Param('id') id: string,
    @Body() dto: UpdateCartDto,
  ) {
    return this.cartService.updateCartItem(client.clientId, parseInt(id), dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove item from cart' })
  async removeFromCart(@CurrentClient() client: any, @Param('id') id: string) {
    return this.cartService.removeFromCart(client.clientId, parseInt(id));
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear cart' })
  async clearCart(@CurrentClient() client: any) {
    return this.cartService.clearCart(client.clientId);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync local cart with server' })
  async syncCart(
    @CurrentClient() client: any,
    @Body()
    body: { cart: Array<{ slug: string; id: number; quantity: number }> },
  ) {
    return this.cartService.syncCart(client.clientId, body.cart);
  }
}
