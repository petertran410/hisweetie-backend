import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateCategoryManagementDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Nguyên Liệu Pha Chế Cao Cấp',
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Category description',
    required: false,
    example: 'Bộ sưu tập nguyên liệu pha chế chất lượng cao cho quán trà sữa',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Parent category ID for hierarchical structure',
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  parent_id?: number;

  @ApiProperty({
    description: 'Priority/order for sorting',
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({
    description: 'Category images URL (JSON array)',
    required: false,
    example: '["image1.jpg", "image2.jpg"]',
  })
  @IsOptional()
  @IsString()
  images_url?: string;
}

export class UpdateCategoryManagementDto {
  @ApiProperty({
    description: 'Category name',
    required: false,
    example: 'Nguyên Liệu Pha Chế Cao Cấp',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    description: 'Category description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Parent category ID',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  parent_id?: number;

  @ApiProperty({
    description: 'Priority/order for sorting',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({
    description: 'Category images URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  images_url?: string;
}

export class CategoryResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true })
  parent_id: number | null;

  @ApiProperty({ nullable: true })
  priority: number | null;

  @ApiProperty({ nullable: true })
  images_url: string | null;

  @ApiProperty()
  created_date: Date;

  @ApiProperty()
  updated_date: Date;

  @ApiProperty({ type: CategoryResponseDto, nullable: true })
  parent?: CategoryResponseDto | null;

  @ApiProperty({ type: [CategoryResponseDto] })
  children?: CategoryResponseDto[];

  @ApiProperty()
  product_count?: number;
}
