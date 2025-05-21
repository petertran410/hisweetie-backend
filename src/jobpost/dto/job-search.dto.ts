import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum JobStatus {
  NOT_EXPIRED = 'NOT_EXPIRED',
  ALL = 'ALL',
}

export class JobSearchDto {
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

  @ApiProperty({ description: 'Search by job title', required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({
    description: 'Filter by application deadline (format: YYYY-MM-DD)',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  applicationDeadline?: string;

  @ApiProperty({
    description:
      'Filter by status (NOT_EXPIRED shows only jobs with deadlines in the future)',
    enum: JobStatus,
    required: false,
  })
  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus;
}
