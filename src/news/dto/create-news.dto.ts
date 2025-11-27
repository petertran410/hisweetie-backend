import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

export enum ContentType {
  NEWS = 'NEWS',
  VIDEO = 'VIDEO',
  CULTURE = 'CULTURE',
  KIEN_THUC_NGUYEN_LIEU = 'KIEN_THUC_NGUYEN_LIEU',
  KIEN_THUC_TRA = 'KIEN_THUC_TRA',
  TREND_PHA_CHE = 'TREND_PHA_CHE',
  REVIEW_SAN_PHAM = 'REVIEW_SAN_PHAM',
  CONG_THUC_PHA_CHE = 'CONG_THUC_PHA_CHE',
}

export class CreateNewsDto {
  @ApiProperty({ description: 'Title of the news/content item' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Title English of the news/content item' })
  @IsString()
  title_en: string;

  @ApiProperty({ description: 'SEO title meta tag', required: false })
  @IsString()
  @IsOptional()
  titleMeta?: string;

  @ApiProperty({
    description: 'Description of the news/content item',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Description English of the news/content item',
    required: false,
  })
  @IsString()
  @IsOptional()
  description_en?: string;

  @ApiProperty({
    description: 'HTML content of the news/content item',
    required: false,
  })
  @IsString()
  @IsOptional()
  htmlContent?: string;

  @ApiProperty({
    description: 'HTML content english of the news/content item',
    required: false,
  })
  @IsString()
  @IsOptional()
  html_content_en?: string;

  @ApiProperty({
    description: 'Image URLs',
    type: [String],
    required: false,
    example: ['https://example.com/image1.jpg'],
  })
  @IsArray()
  @IsOptional()
  imagesUrl?: string[];

  @ApiProperty({
    description: 'Video embed URL for inline video content',
    required: false,
    example: 'https://www.youtube.com/embed/4letvWcz-ic?si=vn0hTIJto8GLbiRl',
  })
  @IsString()
  @IsOptional()
  embedUrl?: string;

  @ApiProperty({
    description: 'Type of content',
    enum: ContentType,
    example: 'NEWS',
  })
  @IsEnum(ContentType)
  type: ContentType;
}
