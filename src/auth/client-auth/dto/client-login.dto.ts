import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ClientLoginDto {
  @ApiProperty({ example: 'nhantran4102002@gmail.com' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsString()
  email: string;

  @ApiProperty({ example: 'Nhantran@4102002' })
  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  pass_word: string;
}
