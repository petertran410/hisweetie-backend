// src/product/dto/create-product.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ description: 'Product title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Product price in VND' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({ description: 'Product quantity' })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ description: 'Array of category IDs' })
  @IsOptional()
  @IsArray()
  categoryIds?: number[];

  @ApiPropertyOptional({ description: 'Product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Array of image URLs' })
  @IsOptional()
  @IsArray()
  imagesUrl?: string[];

  @ApiPropertyOptional({ description: 'General description' })
  @IsOptional()
  @IsString()
  generalDescription?: string;

  @ApiPropertyOptional({ description: 'Product instruction' })
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional({ description: 'Is featured product' })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'Is visible on main website' })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean; // NEW FIELD

  @ApiPropertyOptional({ description: 'Featured thumbnail URL' })
  @IsOptional()
  @IsString()
  featuredThumbnail?: string;

  @ApiPropertyOptional({ description: 'Recipe thumbnail URL' })
  @IsOptional()
  @IsString()
  recipeThumbnail?: string;

  @ApiPropertyOptional({ description: 'Product type' })
  @IsOptional()
  @IsString()
  type?: string;
}
