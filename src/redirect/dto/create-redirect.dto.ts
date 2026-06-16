import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsIn,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateRedirectDto {
  @ApiProperty({
    description: 'Đường dẫn cũ cần redirect (nội bộ, bắt đầu bằng "/")',
    example: '/san-pham/nguyen-lieu-pha-che-lermao/mut-pha-che-lermao',
  })
  @IsString()
  @Matches(/^\//, { message: 'source_path phải bắt đầu bằng "/"' })
  source_path: string;

  @ApiProperty({
    description: 'Đường dẫn mới sẽ điều hướng tới (nội bộ, bắt đầu bằng "/")',
    example: '/san-pham/nguyen-lieu-pha-che/mut-pha-che',
  })
  @IsString()
  @Matches(/^\//, { message: 'target_path phải bắt đầu bằng "/"' })
  target_path: string;

  @ApiProperty({
    description: 'Mã trạng thái redirect (301 hoặc 302)',
    required: false,
    example: 301,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([301, 302], { message: 'status_code chỉ nhận 301 hoặc 302' })
  status_code?: number;

  @ApiProperty({
    description: 'Bật/tắt redirect',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1) return true;
    if (value === 'false' || value === false || value === 0) return false;
    return value;
  })
  is_active?: boolean;

  @ApiProperty({
    description: 'Kiểu khớp: exact (đúng URL) hoặc prefix (URL + mọi con)',
    required: false,
    example: 'exact',
  })
  @IsOptional()
  @IsString()
  @IsIn(['exact', 'prefix'], { message: 'match_type chỉ nhận exact hoặc prefix' })
  match_type?: string;

  @ApiProperty({
    description: 'Ghi chú',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}
