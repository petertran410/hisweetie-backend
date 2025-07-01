// src/product/dto/update-product.dto.ts - ENHANCED
import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { IsOptional, IsNumber } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiProperty({
    description: 'Product rating (1-5)',
    example: 4.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  rate?: number;
}
