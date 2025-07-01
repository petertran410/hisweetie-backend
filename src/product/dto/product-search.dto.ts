import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class ProductSearchDto {
  @ApiProperty({
    description: 'Page size (max 100)',
    example: 12,
    default: 12,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number = 12;

  @ApiProperty({
    description: 'Page number (0-based)',
    example: 0,
    default: 0,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  pageNumber?: number = 0;

  @ApiProperty({
    description: 'Search in product titles',
    example: 'trà đào',
    required: false,
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: 'Filter by product type',
    example: 'SAN_PHAM',
    required: false,
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({
    description: 'Filter by custom category ID',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  categoryId?: number;

  @ApiProperty({
    description: 'Filter by KiotViet category ID',
    example: 2205374,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  kiotVietCategoryId?: number;

  @ApiProperty({
    description: 'Filter by KiotViet trademark ID',
    example: 101,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  kiotVietTrademarkId?: number;

  @ApiProperty({
    description: 'Filter by source (true = KiotViet, false = custom)',
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isFromKiotViet?: boolean;

  @ApiProperty({
    description: 'Order by field',
    example: 'title',
    enum: ['id', 'title', 'price', 'created_date'],
    required: false,
  })
  @IsOptional()
  @IsString()
  orderBy?: string;

  @ApiProperty({
    description: 'Sort direction (true = descending)',
    example: false,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isDesc?: boolean;
}
