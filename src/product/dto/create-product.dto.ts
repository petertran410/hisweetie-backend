// src/product/dto/create-product.dto.ts - ENHANCED
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'Product title',
    example: 'Trà Sữa Trân Châu Đường Đen',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Product description',
    example: 'Trà sữa thơm ngon với trân châu đường đen hấp dẫn',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Price',
    example: '123456.0',
    required: false,
  })
  @IsOptional()
  @IsString()
  kiotviet_price?: number;

  @ApiProperty({
    description: 'General description',
    required: false,
  })
  @IsOptional()
  @IsString()
  general_description?: string;

  @ApiProperty({
    description: 'Preparation instructions',
    required: false,
  })
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiProperty({
    description: 'Custom category ID',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  category_id?: number;

  @ApiProperty({
    description: 'Image URLs (comma-separated or array)',
    example: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
    required: false,
  })
  @IsOptional()
  kiotviet_images?: string | string[];

  @ApiProperty({
    description: 'Featured thumbnail URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  featured_thumbnail?: string;

  @ApiProperty({
    description: 'Recipe thumbnail URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  recipe_thumbnail?: string;

  @ApiProperty({
    description: 'Is featured product',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @ApiProperty({
    description: 'Is visible on website',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;
}
