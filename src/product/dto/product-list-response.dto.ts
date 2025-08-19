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
