import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum OrderType {
  CONTACT = 'CONTACT',
  BUY = 'BUY',
}

export enum OrderStatus {
  NEW = 'NEW',
  PENDING = 'PENDING',
  PAID = 'PAID',
  INPROGRESS = 'INPROGRESS',
  DELIVERING = 'DELIVERING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class OrderSearchDto {
  @ApiProperty({
    description: 'Page size for pagination',
    default: 10,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageSize?: number = 10;

  @ApiProperty({
    description: 'Page number for pagination (0-based)',
    default: 0,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageNumber?: number = 0;

  @ApiProperty({
    description: 'Filter by order type',
    enum: OrderType,
    required: false,
  })
  @IsEnum(OrderType)
  @IsOptional()
  type?: OrderType;

  @ApiProperty({
    description: 'Filter by receiver full name',
    required: false,
  })
  @IsString()
  @IsOptional()
  receiverFullName?: string;

  @ApiProperty({
    description: 'Filter by email address',
    required: false,
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'Filter by phone number',
    required: false,
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({
    description: 'Filter by order status',
    enum: OrderStatus,
    required: false,
  })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @ApiProperty({
    description: 'Filter by specific order ID',
    required: false,
  })
  @IsString()
  @IsOptional()
  id?: string;
}
