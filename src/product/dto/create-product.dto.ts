import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
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
    description: 'Product type',
    example: 'SAN_PHAM',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  type?: number;

  @ApiProperty({
    description: 'Custom category ID',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  category_id?: number;

  @ApiProperty({
    description: 'Image URLs (will be converted to comma-separated string)',
    example: 'https://example.com/image1.jpg,https://example.com/image2.jpg',
    required: false,
  })
  @IsOptional()
  images_url?: string | string[];

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

  @ApiProperty({
    description: 'KiotViet price (for manual products)',
    example: 35000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  kiotviet_price?: number;

  @ApiProperty({
    description: 'Product rating (1-5)',
    example: 4.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  rate?: number;
}
