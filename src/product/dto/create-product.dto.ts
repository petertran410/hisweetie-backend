import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  IsArray,
  IsBoolean,
  IsNumber,
  IsString,
  Min,
  MaxLength,
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

  @ApiProperty({
    description: 'Category IDs array (legacy support)',
    example: [1],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Transform(({ value }) => {
    if (!value) return [];
    if (!Array.isArray(value)) return [value];
    return value.map((v) =>
      typeof v === 'object' && v?.value ? parseInt(v.value) : parseInt(v),
    );
  })
  categoryIds?: number[];

  @ApiProperty({
    description: 'Product slug for SEO-friendly URLs',
    required: false,
    example: 'gau-lermao-mut-quyt-1kg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;
}
