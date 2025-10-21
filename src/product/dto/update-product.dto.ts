import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import {
  IsOptional,
  IsNumber,
  IsArray,
  IsInt,
  IsString,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiProperty({
    description: 'Product rating (1-5)',
    example: 4.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsBoolean()
  price_on?: boolean;

  @IsOptional()
  @IsString()
  category_slug?: string;

  @ApiProperty({
    description: 'Array of category IDs (first one will be used)',
    example: [1, 2],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  categoryIds?: number[];

  @ApiProperty({
    description: 'Direct category ID',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => {
    if (typeof value === 'object' && value?.value) {
      return parseInt(value.value);
    }
    return value ? parseInt(value) : null;
  })
  category_id?: number;
}
