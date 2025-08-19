import { IsArray, ValidateNested } from '@nestjs/class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CategoryPriorityItem {
  @ApiProperty({ description: 'Category ID' })
  id: string;

  @ApiProperty({ description: 'New priority' })
  priority: number;
}

export class UpdateCategoryDto {
  @ApiProperty({
    description: 'Array of category IDs with their new priorities',
    type: [CategoryPriorityItem],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryPriorityItem)
  items: CategoryPriorityItem[];
}
