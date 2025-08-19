import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Nguyên Liệu Pha Chế Đặc Trà',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Category description',
    required: false,
    example: 'Các sản phẩm nguyên liệu dành cho pha chế đặc trà',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Parent category ID',
    required: false,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parent_id?: number;

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
}

export class UpdateCategoryDto extends CreateCategoryDto {}

export class CategoryTreeDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  parent_id?: number;

  @ApiProperty({ required: false })
  priority?: number;

  @ApiProperty({ type: [CategoryTreeDto], required: false })
  children?: CategoryTreeDto[];

  @ApiProperty({ required: false })
  productCount?: number;
}

export class UpdateProductCategoryDto {
  @ApiProperty({
    description: 'New category ID for the product',
    example: 5,
  })
  @IsNumber()
  category_id: number;
}
