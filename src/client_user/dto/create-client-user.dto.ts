import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsNumberString,
  Matches,
  Length,
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

  detailed_address?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  kiotviet_customer_id?: number | null;
}

export class UpdateClientUserDto {
  @ApiProperty({
    description: 'Full name',
    example: 'Nguyễn Văn A',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  full_name?: string;

  @ApiProperty({
    description: 'Email address',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Phone number',
    example: '0987654321',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(10, 11)
  phone?: string;

  @ApiProperty({
    description: 'Detailed address',
    example: '123 Nguyễn Huệ',
    required: false,
  })
  @IsOptional()
  @IsString()
  detailed_address?: string;

  @ApiProperty({
    description: 'Province/City',
    example: 'Thành phố Hồ Chí Minh',
    required: false,
  })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiProperty({
    description: 'District',
    example: 'Quận 1',
    required: false,
  })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({
    description: 'Ward/Commune',
    example: 'Phường Bến Nghé',
    required: false,
  })
  @IsOptional()
  @IsString()
  ward?: string;
}
