import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteOAuthRegistrationDto {
  @ApiProperty({ example: 'google_1234567890' })
  @IsNotEmpty()
  @IsString()
  tempKey: string;

  @ApiProperty({ example: '0931566676' })
  @IsNotEmpty()
  @Matches(/^0[0-9]{9}$/, {
    message: 'Số điện thoại phải có 10 chữ số và bắt đầu bằng số 0',
  })
  phone: string;
}
