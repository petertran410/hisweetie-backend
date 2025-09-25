import { IsNotEmpty, IsString } from 'class-validator';

export class ClientLoginDto {
  @IsNotEmpty()
  @IsString()
  identifier: string; // email hoặc phone

  @IsNotEmpty()
  @IsString()
  password: string;
}
