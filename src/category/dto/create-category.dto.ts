import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Trà Sữa',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Category description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Category images (comma-separated URLs)',
    required: false,
  })
  @IsOptional()
  @IsString()
  images_url?: string;

  @ApiProperty({
    description: 'Parent category ID',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  parent_id?: number;

  @ApiProperty({
    description: 'Display priority',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  priority?: number;
}
