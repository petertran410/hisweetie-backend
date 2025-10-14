import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsEmail, IsString, MinLength } from 'class-validator';

export class ForgotPasswordRequestDto {
  @ApiProperty({ example: 'nhantran4102002@gmail.com' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail(undefined, { message: 'Invalid email' })
  email: string;
}

export class VerifyForgotPasswordOtpDto {
  @ApiProperty({ example: 'nhantran4102002@gmail.com' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail(undefined, { message: 'Invalid email' })
  email: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty({ message: 'OTP code is required' })
  @IsString()
  code: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'nhantran4102002@gmail.com' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail(undefined, { message: 'Invalid email' })
  email: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty({ message: 'OTP code is required' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'NewPassword@123' })
  @IsNotEmpty({ message: 'New password is required' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  new_password: string;
}
