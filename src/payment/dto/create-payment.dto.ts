// src/payment/dto/create-payment.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerInfoDto {
  @ApiProperty({ description: 'Customer full name' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ description: 'Customer email' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Customer phone number' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ description: 'Delivery address' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ description: 'Order note', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CartItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsNotEmpty()
  @IsNumber()
  productId: number;

  @ApiProperty({ description: 'Product quantity' })
  @IsNotEmpty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ description: 'Product price' })
  @IsNotEmpty()
  @IsNumber()
  price: number;

  @ApiProperty({ description: 'Product title' })
  @IsNotEmpty()
  @IsString()
  title: string;
}

export class AmountsDto {
  @ApiProperty({ description: 'Subtotal amount' })
  @IsNotEmpty()
  @IsNumber()
  subtotal: number;

  @ApiProperty({ description: 'Shipping cost' })
  @IsNotEmpty()
  @IsNumber()
  shipping: number;

  @ApiProperty({ description: 'Total amount' })
  @IsNotEmpty()
  @IsNumber()
  total: number;
}

export enum PaymentMethod {
  SEPAY_BANK = 'sepay_bank',
  SEPAY_MOMO = 'sepay_momo',
  COD = 'cod',
}

export class CreatePaymentDto {
  @ApiProperty({ description: 'Customer information' })
  @ValidateNested()
  @Type(() => CustomerInfoDto)
  customerInfo: CustomerInfoDto;

  @ApiProperty({ description: 'Cart items', type: [CartItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  cartItems: CartItemDto[];

  @ApiProperty({ description: 'Payment method', enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ description: 'Amount details' })
  @ValidateNested()
  @Type(() => AmountsDto)
  amounts: AmountsDto;
}

// src/payment/dto/sepay-webhook.dto.ts
export class SepayWebhookDto {
  @ApiProperty({ description: 'Transaction ID from SePay' })
  @IsString()
  transactionId: string;

  @ApiProperty({ description: 'Order code' })
  @IsString()
  orderCode: string;

  @ApiProperty({ description: 'Payment status' })
  @IsString()
  status: string;

  @ApiProperty({ description: 'Payment amount' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Gateway code' })
  @IsString()
  gatewayCode: string;

  @ApiProperty({ description: 'Signature for verification' })
  @IsString()
  signature: string;

  @ApiProperty({ description: 'Additional data', required: false })
  @IsOptional()
  data?: any;
}

// src/payment/dto/payment-status.dto.ts
export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export class PaymentStatusResponseDto {
  @ApiProperty({ description: 'Payment order ID' })
  orderId: string;

  @ApiProperty({ description: 'Payment status', enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ description: 'Transaction ID', required: false })
  transactionId?: string;

  @ApiProperty({ description: 'Payment amount' })
  amount: number;

  @ApiProperty({ description: 'Payment method' })
  paymentMethod: string;

  @ApiProperty({ description: 'Created date' })
  createdDate: Date;

  @ApiProperty({ description: 'Updated date' })
  updatedDate: Date;

  @ApiProperty({ description: 'Payment gateway response', required: false })
  gatewayResponse?: any;
}
