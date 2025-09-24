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
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerInfoDto {
  @ApiProperty({
    description: 'Customer full name',
    example: 'Nguyễn Văn A',
    minLength: 2,
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @Length(2, 100, { message: 'Họ tên phải từ 2-100 ký tự' })
  fullName: string;

  @ApiProperty({
    description: 'Customer email',
    example: 'nguyen.van.a@gmail.com',
  })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({
    description: 'Customer phone number',
    example: '0987654321',
  })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @Length(10, 11, { message: 'Số điện thoại phải có 10-11 số' })
  phone: string;

  @ApiProperty({
    description: 'Delivery address',
    example: '123 Nguyễn Huệ, Quận 1, TP.HCM',
  })
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  @Length(10, 500, { message: 'Địa chỉ phải từ 10-500 ký tự' })
  address: string;

  @ApiProperty({
    description: 'Detailed address (house number, street)',
    example: '123 Ngõ 456 Đường ABC',
    required: true,
  })
  @IsNotEmpty({ message: 'Địa chỉ chi tiết không được để trống' })
  @IsString({ message: 'Địa chỉ chi tiết phải là chuỗi ký tự' })
  @Length(5, 500, { message: 'Địa chỉ chi tiết phải từ 5-500 ký tự' })
  detailedAddress: string;

  @ApiProperty({
    description: 'Province/City and District',
    example: 'TP. Hồ Chí Minh - Quận 1',
    required: true,
  })
  @IsNotEmpty({ message: 'Tỉnh/TP - Huyện/Quận không được để trống' })
  @IsString({ message: 'Tỉnh/TP - Huyện/Quận phải là chuỗi ký tự' })
  provinceDistrict: string;

  @ApiProperty({
    description: 'Ward/Commune',
    example: 'Phường Bến Nghé',
    required: true,
  })
  @IsNotEmpty({ message: 'Phường/Xã không được để trống' })
  @IsString({ message: 'Phường/Xã phải là chuỗi ký tự' })
  ward: string;

  @ApiProperty({
    description: 'Order note',
    required: false,
    example: 'Giao hàng buổi chiều',
  })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  @Length(0, 1000, { message: 'Ghi chú không được quá 1000 ký tự' })
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
