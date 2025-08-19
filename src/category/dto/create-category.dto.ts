import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, Min } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name', example: 'Siro Pha Chế' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Category description',
    required: false,
    example: 'Các loại siro dùng để pha chế đồ uống',
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
  @IsNumber()
  @Min(1)
  parent_id?: number;

  @ApiProperty({
    description: 'Priority order for display',
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiProperty({
    description: 'Category images URLs',
    required: false,
    example: ['https://example.com/image1.jpg'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images_url?: string[];
}
