// src/product/dto/kiotviet-sync.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsArray,
  IsDateString,
  IsEnum,
  IsBoolean,
} from 'class-validator';

export enum SyncMode {
  FULL = 'FULL',
  INCREMENTAL = 'INCREMENTAL',
  TARGET_CATEGORIES = 'TARGET_CATEGORIES',
}

export class KiotVietSyncDto {
  @ApiProperty({
    description: 'Sync mode',
    enum: SyncMode,
    default: SyncMode.INCREMENTAL,
    required: false,
  })
  @IsEnum(SyncMode)
  @IsOptional()
  mode?: SyncMode = SyncMode.INCREMENTAL;

  @ApiProperty({
    description: 'Last modified date for incremental sync (ISO string)',
    example: '2024-01-01T00:00:00Z',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  since?: string;

  @ApiProperty({
    description: 'Specific category names to sync (comma-separated)',
    example: 'Lermao,Trà Phượng Hoàng',
    required: false,
  })
  @IsString()
  @IsOptional()
  categories?: string;

  @ApiProperty({
    description: 'Force clean database before sync',
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  cleanFirst?: boolean = false;
}

// src/category/dto/category-sync.dto.ts
export class CategorySyncDto {
  @ApiProperty({
    description: 'Force clean database before sync',
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  cleanFirst?: boolean = false;

  @ApiProperty({
    description: 'Preview only - do not actually sync',
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  previewOnly?: boolean = false;
}

// src/product/dto/hierarchical-product-search.dto.ts
export class HierarchicalProductSearchDto {
  @ApiProperty({
    description: 'Page size for pagination',
    default: 10,
    required: false,
  })
  @IsOptional()
  pageSize?: number = 10;

  @ApiProperty({
    description: 'Page number for pagination',
    default: 0,
    required: false,
  })
  @IsOptional()
  pageNumber?: number = 0;

  @ApiProperty({
    description: 'Search by product title',
    required: false,
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({
    description: 'Filter by product type',
    required: false,
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({
    description: 'Parent category IDs to include (comma-separated)',
    example: '2205381,2205374',
    required: false,
  })
  @IsString()
  @IsOptional()
  parentCategoryIds?: string;

  @ApiProperty({
    description: 'Include products from child categories',
    default: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  includeChildren?: boolean = true;
}
