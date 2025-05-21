// src/news/dto/create-news.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

export enum ContentType {
  NEWS = 'NEWS',
  VIDEO = 'VIDEO',
  CULTURE = 'CULTURE', // Make sure CULTURE type is included
}

export class CreateNewsDto {
  @ApiProperty({ description: 'Title of the news/content item' })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Description of the news/content item',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'HTML content of the news/content item',
    required: false,
  })
  @IsString()
  @IsOptional()
  htmlContent?: string;

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
    description: 'Type of content',
    enum: ContentType,
    example: 'CULTURE', // Update example to use CULTURE
  })
  @IsEnum(ContentType)
  type: ContentType;
}
