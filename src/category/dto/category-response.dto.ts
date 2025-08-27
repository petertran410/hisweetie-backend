import { ApiProperty } from '@nestjs/swagger';

export class CategoryDto {
  @ApiProperty({ description: 'Category ID' })
  id: number;

  @ApiProperty({ description: 'Category name' })
  name: string;

  @ApiProperty({ description: 'Category description', nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Parent category ID', nullable: true })
  parent_id: number | null;

  @ApiProperty({ description: 'Priority order', nullable: true })
  priority: number | null;

  @ApiProperty({ description: 'Category images', nullable: true })
  images_url: string[] | null;

  @ApiProperty({ description: 'Creation date' })
  created_date: Date;

  @ApiProperty({ description: 'Last update date' })
  updated_date: Date;

  @ApiProperty({
    description: 'Child categories',
    type: [CategoryDto],
    required: false,
  })
  children?: CategoryDto[];

  @ApiProperty({ description: 'Parent category', nullable: true })
  parent?: CategoryDto;

  @ApiProperty({ description: 'Product count in this category' })
  product_count?: number;
}

export class CategoryTreeResponseDto {
  @ApiProperty({ type: [CategoryDto] })
  data: CategoryDto[];

  @ApiProperty({ description: 'Total categories count' })
  total: number;

  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;
}
