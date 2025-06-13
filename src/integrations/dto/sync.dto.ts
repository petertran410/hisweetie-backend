// src/integrations/dto/sync.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, IsBoolean } from 'class-validator';

export class ManualCustomerSyncDto {
  @ApiProperty({
    description: 'Customer ID from KiotViet',
    example: 12345,
  })
  @IsNumber()
  customerId: number;
}

export class SyncStatusResponseDto {
  @ApiProperty({ description: 'Whether sync is currently running' })
  isRunning: boolean;

  @ApiProperty({
    description: 'Last full sync date',
    nullable: true,
    example: '2025-06-13T10:30:00Z',
  })
  lastFullSyncDate: string | null;

  @ApiProperty({ description: 'Total number of customer mappings in cache' })
  totalMappings: number;
}

export class SyncStatsDto {
  @ApiProperty({ description: 'Total customers in KiotViet' })
  totalKiotVietCustomers: number;

  @ApiProperty({ description: 'Total records in Lark Base' })
  totalLarkRecords: number;

  @ApiProperty({ description: 'Number of records created' })
  created: number;

  @ApiProperty({ description: 'Number of records updated' })
  updated: number;

  @ApiProperty({ description: 'Number of records deleted' })
  deleted: number;

  @ApiProperty({ description: 'Number of errors encountered' })
  errors: number;

  @ApiProperty({
    description: 'Sync start time',
    example: '2025-06-13T10:30:00Z',
  })
  startTime: string;

  @ApiProperty({
    description: 'Sync end time',
    example: '2025-06-13T10:35:00Z',
    nullable: true,
  })
  endTime?: string;

  @ApiProperty({
    description: 'Sync duration',
    example: '5m 30s',
    nullable: true,
  })
  duration?: string;
}

export class ApiResponseDto<T = any> {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Response data', required: false })
  @IsOptional()
  data?: T;
}

// src/integrations/dto/kiotviet-webhook.dto.ts
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
