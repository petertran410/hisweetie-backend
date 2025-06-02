// src/payment/dto/index.ts - Centralized exports
export * from './create-payment.dto';

// src/payment/dto/create-payment.dto.ts - FIXED VERSION
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
  Min,
  Max,
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
  @ApiProperty({
    description: 'Product ID',
    example: 12345,
  })
  @IsNotEmpty({ message: 'ID sản phẩm không được để trống' })
  @IsNumber({}, { message: 'ID sản phẩm phải là số' })
  @Min(1, { message: 'ID sản phẩm phải lớn hơn 0' })
  productId: number;

  @ApiProperty({
    description: 'Product quantity',
    example: 2,
    minimum: 1,
    maximum: 999,
  })
  @IsNotEmpty({ message: 'Số lượng không được để trống' })
  @IsNumber({}, { message: 'Số lượng phải là số' })
  @Min(1, { message: 'Số lượng phải ít nhất là 1' })
  @Max(999, { message: 'Số lượng không được quá 999' })
  quantity: number;

  @ApiProperty({
    description: 'Product price (VND)',
    example: 150000,
  })
  @IsNotEmpty({ message: 'Giá sản phẩm không được để trống' })
  @IsNumber({}, { message: 'Giá sản phẩm phải là số' })
  @Min(0, { message: 'Giá sản phẩm không được âm' })
  price: number;

  @ApiProperty({
    description: 'Product title',
    example: 'Trà Ô Long Đài Loan',
  })
  @IsNotEmpty({ message: 'Tên sản phẩm không được để trống' })
  @IsString({ message: 'Tên sản phẩm phải là chuỗi ký tự' })
  @Length(1, 255, { message: 'Tên sản phẩm phải từ 1-255 ký tự' })
  title: string;
}

export class AmountsDto {
  @ApiProperty({
    description: 'Subtotal amount (VND)',
    example: 300000,
  })
  @IsNotEmpty({ message: 'Tạm tính không được để trống' })
  @IsNumber({}, { message: 'Tạm tính phải là số' })
  @Min(0, { message: 'Tạm tính không được âm' })
  subtotal: number;

  @ApiProperty({
    description: 'Shipping cost (VND)',
    example: 30000,
  })
  @IsNotEmpty({ message: 'Phí vận chuyển không được để trống' })
  @IsNumber({}, { message: 'Phí vận chuyển phải là số' })
  @Min(0, { message: 'Phí vận chuyển không được âm' })
  shipping: number;

  @ApiProperty({
    description: 'Total amount (VND)',
    example: 330000,
  })
  @IsNotEmpty({ message: 'Tổng tiền không được để trống' })
  @IsNumber({}, { message: 'Tổng tiền phải là số' })
  @Min(1000, { message: 'Tổng tiền phải ít nhất 1,000 VND' })
  total: number;
}

export enum PaymentMethod {
  SEPAY_BANK = 'sepay_bank',
  SEPAY_MOMO = 'sepay_momo',
  COD = 'cod',
}

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Customer information',
    type: CustomerInfoDto,
  })
  @ValidateNested()
  @Type(() => CustomerInfoDto)
  customerInfo: CustomerInfoDto;

  @ApiProperty({
    description: 'Cart items',
    type: [CartItemDto],
    minItems: 1,
  })
  @IsArray({ message: 'Giỏ hàng phải là mảng' })
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  cartItems: CartItemDto[];

  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    example: PaymentMethod.SEPAY_BANK,
  })
  @IsEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' })
  paymentMethod: PaymentMethod;

  @ApiProperty({
    description: 'Amount details',
    type: AmountsDto,
  })
  @ValidateNested()
  @Type(() => AmountsDto)
  amounts: AmountsDto;
}

// src/payment/dto/sepay-webhook.dto.ts
export class SepayWebhookDto {
  @ApiProperty({
    description: 'Transaction ID from SePay',
    example: 'TXN_123456789',
  })
  @IsString({ message: 'ID giao dịch phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'ID giao dịch không được để trống' })
  transactionId: string;

  @ApiProperty({
    description: 'Order code',
    example: 'DT12345678AB',
  })
  @IsString({ message: 'Mã đơn hàng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã đơn hàng không được để trống' })
  orderCode: string;

  @ApiProperty({
    description: 'Payment status',
    example: 'SUCCESS',
    enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'],
  })
  @IsString({ message: 'Trạng thái thanh toán phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Trạng thái thanh toán không được để trống' })
  status: string;

  @ApiProperty({
    description: 'Payment amount (VND)',
    example: 330000,
  })
  @IsNumber({}, { message: 'Số tiền phải là số' })
  @Min(0, { message: 'Số tiền không được âm' })
  amount: number;

  @ApiProperty({
    description: 'Gateway code',
    example: 'SEPAY_BANK',
  })
  @IsString({ message: 'Mã cổng thanh toán phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã cổng thanh toán không được để trống' })
  gatewayCode: string;

  @ApiProperty({
    description: 'Signature for verification',
    example: 'A1B2C3D4E5F6...',
  })
  @IsString({ message: 'Chữ ký phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Chữ ký không được để trống' })
  signature: string;

  @ApiProperty({
    description: 'Additional data',
    required: false,
  })
  @IsOptional()
  data?: any;
}

// src/payment/dto/payment-status.dto.ts
export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  PAID = 'PAID',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export class PaymentStatusResponseDto {
  @ApiProperty({
    description: 'Payment order ID',
    example: '123456789',
  })
  orderId: string;

  @ApiProperty({
    description: 'Payment status',
    enum: PaymentStatus,
    example: PaymentStatus.SUCCESS,
  })
  status: PaymentStatus;

  @ApiProperty({
    description: 'Transaction ID',
    required: false,
    example: 'TXN_123456789',
  })
  transactionId?: string;

  @ApiProperty({
    description: 'Payment amount (VND)',
    example: 330000,
  })
  amount: number;

  @ApiProperty({
    description: 'Payment method',
    example: 'sepay_bank',
  })
  paymentMethod: string;

  @ApiProperty({
    description: 'Created date',
    example: '2024-01-01T10:00:00Z',
  })
  createdDate: Date;

  @ApiProperty({
    description: 'Updated date',
    example: '2024-01-01T10:05:00Z',
  })
  updatedDate: Date;

  @ApiProperty({
    description: 'Payment gateway response',
    required: false,
  })
  gatewayResponse?: any;
}

// Validation request DTOs
export class PaymentStatusQueryDto {
  @ApiProperty({
    description: 'Order ID to check',
    example: '123456789',
  })
  @IsString({ message: 'ID đơn hàng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'ID đơn hàng không được để trống' })
  orderId: string;
}

export class PaymentVerificationDto {
  @ApiProperty({
    description: 'Order ID',
    example: '123456789',
  })
  @IsString({ message: 'ID đơn hàng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'ID đơn hàng không được để trống' })
  orderId: string;

  @ApiProperty({
    description: 'Transaction ID',
    example: 'TXN_123456789',
  })
  @IsString({ message: 'ID giao dịch phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'ID giao dịch không được để trống' })
  transactionId: string;
}

export class QRCodeGenerationDto {
  @ApiProperty({
    description: 'Order ID',
    example: '123456789',
  })
  @IsString({ message: 'ID đơn hàng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'ID đơn hàng không được để trống' })
  orderId: string;

  @ApiProperty({
    description: 'Payment amount (VND)',
    example: 330000,
  })
  @IsNumber({}, { message: 'Số tiền phải là số' })
  @Min(1000, { message: 'Số tiền phải ít nhất 1,000 VND' })
  amount: number;

  @ApiProperty({
    description: 'Bank code (optional)',
    required: false,
    example: 'VCB',
  })
  @IsOptional()
  @IsString({ message: 'Mã ngân hàng phải là chuỗi ký tự' })
  bankCode?: string;
}
