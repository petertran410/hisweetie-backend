// src/integrations/dto/kiotviet-webhook.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class KiotVietCustomerDataDto {
  @ApiProperty({ description: 'Customer ID' })
  Id: number;

  @ApiProperty({ description: 'Customer code' })
  Code: string;

  @ApiProperty({ description: 'Customer name' })
  Name: string;

  @ApiProperty({ description: 'Customer gender', nullable: true })
  @IsOptional()
  Gender?: boolean;

  @ApiProperty({ description: 'Birth date', nullable: true })
  @IsOptional()
  BirthDate?: string;

  @ApiProperty({ description: 'Contact number' })
  ContactNumber: string;

  @ApiProperty({ description: 'Address' })
  Address: string;

  @ApiProperty({ description: 'Location name', nullable: true })
  @IsOptional()
  LocationName?: string;

  @ApiProperty({ description: 'Email address' })
  Email: string;

  @ApiProperty({ description: 'Last modified date' })
  ModifiedDate: string;

  @ApiProperty({ description: 'Customer type', nullable: true })
  @IsOptional()
  Type?: number;

  @ApiProperty({ description: 'Organization', nullable: true })
  @IsOptional()
  Organization?: string;

  @ApiProperty({ description: 'Tax code', nullable: true })
  @IsOptional()
  TaxCode?: string;

  @ApiProperty({ description: 'Comments', nullable: true })
  @IsOptional()
  Comments?: string;
}

export class KiotVietNotificationDto {
  @ApiProperty({ description: 'Action type (create, update, delete)' })
  Action: string;

  @ApiProperty({
    description: 'Array of customer data',
    type: [KiotVietCustomerDataDto],
  })
  Data: KiotVietCustomerDataDto[];
}

export class KiotVietWebhookDto {
  @ApiProperty({ description: 'Webhook ID' })
  Id: string;

  @ApiProperty({ description: 'Attempt number' })
  Attempt: number;

  @ApiProperty({
    description: 'Array of notifications',
    type: [KiotVietNotificationDto],
  })
  Notifications: KiotVietNotificationDto[];
}
