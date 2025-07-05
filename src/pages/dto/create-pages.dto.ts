// src/pages/dto/create-pages.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreatePagesDto {
  @ApiProperty({ description: 'URL slug', example: 'chinh-sach-bao-mat' })
  @IsString()
  slug: string;

  @ApiProperty({ description: 'Tiêu đề trang', example: 'Chính Sách Bảo Mật' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Nội dung HTML', required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ description: 'SEO title', required: false })
  @IsOptional()
  @IsString()
  meta_title?: string;

  @ApiProperty({ description: 'SEO description', required: false })
  @IsOptional()
  @IsString()
  meta_description?: string;

  @ApiProperty({ description: 'Thứ tự hiển thị', required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  display_order?: number;

  @ApiProperty({ description: 'ID trang cha', required: false })
  @IsOptional()
  @IsNumber()
  parent_id?: number;

  @ApiProperty({
    description: 'Có hiển thị không',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({
    description: 'Là trang chính',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  is_main_page?: boolean;
}
