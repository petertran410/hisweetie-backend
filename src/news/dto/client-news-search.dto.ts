// src/news/dto/client-news-search.dto.ts - UPDATED với types mới
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum NewsType {
  NEWS = 'NEWS',
  CULTURE = 'CULTURE',
  VIDEO = 'VIDEO',
  KIEN_THUC_NGUYEN_LIEU = 'KIEN_THUC_NGUYEN_LIEU',
  KIEN_THUC_TRA = 'KIEN_THUC_TRA',
  TREND_PHA_CHE = 'TREND_PHA_CHE',
  REVIEW_SAN_PHAM = 'REVIEW_SAN_PHAM',
  CONG_THUC_PHA_CHE = 'CONG_THUC_PHA_CHE',
}

export class ClientNewsSearchDto {
  @ApiProperty({
    description: 'Page size for pagination',
    default: 10,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageSize?: number = 10;

  @ApiProperty({
    description: 'Page number for pagination',
    default: 0,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageNumber?: number = 0;

  @ApiProperty({ description: 'Search by title', required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({
    description: 'Filter by content type',
    enum: NewsType,
    required: false,
  })
  @IsEnum(NewsType)
  @IsOptional()
  type?: NewsType;

  @ApiProperty({ description: 'Filter by featured content', required: false })
  @IsOptional()
  @Type(() => Boolean)
  featured?: boolean;
}
