import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsNumberString,
  Matches,
} from 'class-validator';

export class ClientUserType {
  client_id?: number;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  avatar?: string | null;

  @ApiProperty({ default: 'Ngọc Nhân' })
  @Matches(/\D+/g, { message: 'Invalid name!' })
  full_name?: string | null;

  @ApiProperty({ default: 'nhantran4102002@gmail.com' })
  @IsEmail(undefined, { message: 'Invalid email!' })
  email?: string | null;

  @ApiProperty({ default: 'Nhantran@4102002' })
  pass_word?: string | null;

  @ApiProperty({ default: '0901391300' })
  @IsNumberString(undefined, { message: 'Invalid phone number!' })
  phone?: string | null;
}
