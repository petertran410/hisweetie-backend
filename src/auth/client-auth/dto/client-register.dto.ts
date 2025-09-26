import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsNotEmpty,
  Matches,
  IsNumberString,
} from 'class-validator';

export class ClientRegisterDto {
  @ApiProperty({ example: 'Ngọc Nhân' })
  @IsNotEmpty({ message: 'Full name is required' })
  @Matches(/\D+/g, { message: 'Invalid name!' })
  full_name: string;

  @ApiProperty({ example: 'nhantran4102002@gmail.com' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail(undefined, { message: 'Invalid email!' })
  email: string;

  @ApiProperty({ example: '0901391300' })
  @IsNotEmpty({ message: 'Phone is required' })
  @IsNumberString(undefined, { message: 'Invalid phone number!' })
  phone: string;

  @ApiProperty({ example: 'Nhantran@4102002' })
  @IsNotEmpty({ message: 'Password is required' })
  pass_word: string;
}
