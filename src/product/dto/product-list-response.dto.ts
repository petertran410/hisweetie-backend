// src/product/dto/product-list-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ProductListItemDto {
  @ApiProperty({ description: 'Product ID' })
  id: number;

  @ApiProperty({ description: 'Category ID', nullable: true })
  category_id: number | null;

  @ApiProperty({ description: 'Product description', nullable: true })
  description: string | null;

  @ApiProperty({ description: 'General description', nullable: true })
  general_description: string | null;

  @ApiProperty({ description: 'Usage instruction', nullable: true })
  instruction: string | null;

  @ApiProperty({ description: 'Product title', nullable: true })
  title: string | null;

  @ApiProperty({ description: 'KiotViet product name', nullable: true })
  kiotviet_name: string | null;

  @ApiProperty({ description: 'KiotViet product images', nullable: true })
  kiotviet_images: any | null;

  @ApiProperty({ description: 'KiotViet product price', nullable: true })
  kiotviet_price: number | null;

  @ApiProperty({ description: 'Effective product price', nullable: true })
  price?: number | null;

  @ApiProperty({ description: 'POS product code', nullable: true })
  posCode?: string | null;

  @ApiProperty({ description: 'POS product name', nullable: true })
  posName?: string | null;

  @ApiProperty({ description: 'POS pricebook price', nullable: true })
  posPrice?: number | null;

  @ApiProperty({ description: 'POS product images', nullable: true })
  posImages?: string[] | null;

  @ApiProperty({ description: 'Whether product is mapped to POS' })
  isFromPos?: boolean;

  @ApiProperty({ description: 'KiotViet product description', nullable: true })
  kiotviet_description: string | null;
}

export class GetAllProductsResponseDto {
  @ApiProperty({ type: [ProductListItemDto] })
  data: ProductListItemDto[];

  @ApiProperty({ description: 'Total number of products' })
  total: number;

  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;
}
