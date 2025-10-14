import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddToCartDto {
  @ApiProperty()
  @IsInt()
  @IsPositive()
  product_id: number;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  quantity: number;
}
