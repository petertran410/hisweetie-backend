// src/pages/dto/search-pages.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchPagesDto {
  @ApiProperty({ description: 'Page size', required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number = 10;

  @ApiProperty({ description: 'Page number', required: false, default: 0 })
  @IsOptional()
  @Type(() => Number || null)
  @IsNumber()
  pageNumber?: number = 0 || null;

  @ApiProperty({ description: 'Tìm kiếm theo tiêu đề', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: 'Tìm kiếm theo slug', required: false })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({ description: 'ID trang cha', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  parent_id?: number;

  @ApiProperty({ description: 'Chỉ lấy trang active', required: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_active?: boolean;
}
