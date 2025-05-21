import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Category description', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Parent category ID', required: false })
  @IsString()
  @IsOptional()
  parentId?: string;

  @ApiProperty({ description: 'Image URLs', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  imagesUrl?: string[];

  @ApiProperty({ description: 'Display priority', required: false })
  @IsNumber()
  @IsOptional()
  priority?: number;
}
