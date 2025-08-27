import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  Min,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Nguyên Liệu Pha Chế Đặc Trà',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Category slug (auto-generated if not provided)',
    required: false,
    example: 'nguyen-lieu-pha-che-dac-tra',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @ApiProperty({
    description: 'Category description',
    required: false,
    example: 'Các sản phẩm nguyên liệu dành cho pha chế đặc trà',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Category title meta',
    required: false,
  })
  @IsOptional()
  @IsString()
  title_meta?: string;

  @ApiProperty({
    description: 'Priority/Order for sorting',
    required: false,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({
    description: 'Parent category ID',
    required: false,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => {
    if (!value) return null;
    if (typeof value === 'object' && value?.value) return parseInt(value.value);
    return parseInt(value);
  })
  parent_id?: number;
}

export class UpdateCategoryDto extends CreateCategoryDto {}

export class UpdateProductCategoryDto {
  @ApiProperty({
    description: 'New category ID for the product',
    example: 5,
  })
  @IsNumber()
  category_id: number;
}
