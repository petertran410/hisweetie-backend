import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateMenuCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'slug không được rỗng' })
  slug: string;
}
