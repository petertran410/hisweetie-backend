import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsEmail, IsString } from 'class-validator';
import { IsStrongPassword } from './password-validator.decorator';

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
  @IsStrongPassword()
  new_password: string;
}
