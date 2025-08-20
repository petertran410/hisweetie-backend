import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { IsOptional, IsNumber, IsArray, IsInt } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiProperty({
    description: 'Product rating (1-5)',
    example: 4.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  rate?: number;

  @ApiProperty({
    description: 'Array of category IDs (first one will be used)',
    example: [1, 2],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  categoryIds?: number[];
}
