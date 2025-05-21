import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum NewsType {
  NEWS = 'NEWS',
  CULTURE = 'CULTURE',
  VIDEO = 'VIDEO',
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
