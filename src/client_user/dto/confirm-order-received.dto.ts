import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmOrderReceivedDto {
  @ApiProperty({
    description: 'Invoice code from KiotViet',
    example: 'HDV0001234',
  })
  @IsNotEmpty()
  @IsString()
  orderCode: string;
}
