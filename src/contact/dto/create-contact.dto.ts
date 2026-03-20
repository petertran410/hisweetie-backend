import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEmail,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @IsString()
  @MaxLength(100)
  receiverFullName: string;

  @ApiProperty({ example: '0987654321' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @IsString()
  @Matches(/^(03|05|07|08|09)\d{7,10}$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phoneNumber: string;

  @ApiProperty({ example: 'test@gmail.com' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'Tôi muốn hỏi về sản phẩm X...' })
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  @IsString()
  @MaxLength(2000)
  note: string;
}
