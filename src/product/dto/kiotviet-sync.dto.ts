// src/product/dto/kiotviet-sync.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
  IsArray,
} from 'class-validator';

export class KiotVietSyncDto {
  @ApiProperty({
    description:
      'Only sync products modified since this date (YYYY-MM-DD format)',
    example: '2024-01-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiProperty({
    description: 'Force clean database before sync',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  cleanFirst?: boolean;

  @ApiProperty({
    description: 'Specific category names to sync (comma-separated)',
    example: 'Lermao,Trà Phượng Hoàng',
    required: false,
  })
  @IsOptional()
  @IsString()
  categories?: string;
}

export class BulkVisibilityUpdateDto {
  @ApiProperty({
    description: 'Array of product IDs to update',
    example: [1, 2, 3, 4, 5],
  })
  @IsArray()
  productIds: number[];

  @ApiProperty({
    description: 'New visibility status',
    example: true,
  })
  @IsBoolean()
  isVisible: boolean;
}

export class TrademarkStatusUpdateDto {
  @ApiProperty({
    description: 'KiotViet trademark ID',
    example: 123,
  })
  trademarkId: number;

  @ApiProperty({
    description: 'Active status for the trademark',
    example: true,
  })
  @IsBoolean()
  isActive: boolean;
}
