// src/product/dto/product-response.dto.ts - Tạo DTO mới cho CMS response
import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  parent_id?: number;
}

export class ProductCMSResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  kiotviet_name?: string;

  @ApiProperty({ required: false })
  kiotviet_price?: number;

  @ApiProperty()
  is_visible: boolean;

  @ApiProperty({ required: false })
  category_id?: number;

  @ApiProperty({ type: CategoryResponseDto, required: false })
  category?: CategoryResponseDto;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  general_description?: string;

  @ApiProperty({ required: false })
  instruction?: string;
}
