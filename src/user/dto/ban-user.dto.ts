import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class BanUserDto {
  @ApiProperty({ description: 'User ID to ban' })
  @IsString()
  username: string;
}
