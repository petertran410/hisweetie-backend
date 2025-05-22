import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum } from 'class-validator';

export enum UserRole {
  ROLE_USER = 'ROLE_USER',
  ROLE_ADMIN = 'ROLE_ADMIN',
  ROLE_SUPER_ADMIN = 'ROLE_SUPER_ADMIN',
}

export class ChangeRoleDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  username: string;

  @ApiProperty({ description: 'New role for the user', enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}
