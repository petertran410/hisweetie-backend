// src/integrations/customer-sync/customer-sync.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  Headers,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { CustomerSyncService, SyncStats } from './customer-sync.service';
import { KiotVietService } from '../kiotviet/kiotviet.service';
import { LarkService } from '../lark/lark.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@ApiTags('Customer Sync')
@Controller('customer-sync')
export class CustomerSyncController {
  private readonly logger = new Logger(CustomerSyncController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly customerSyncService: CustomerSyncService,
    private readonly kiotVietService: KiotVietService,
    private readonly larkService: LarkService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.webhookSecret =
      this.configService.get<string>('KIOTVIET_WEBHOOK_SECRET') ||
      'default-secret';

    if (this.webhookSecret === 'default-secret') {
      this.logger.warn(
        'KIOTVIET_WEBHOOK_SECRET not configured. Using default secret.',
      );
    }
  }

  @Post('full-sync')
  @ApiOperation({
    summary: 'Perform full sync',
    description: 'Đồng bộ toàn bộ khách hàng từ KiotViet vào Lark Base',
  })
  @ApiResponse({
    status: 200,
    description: 'Full sync completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            totalKiotVietCustomers: { type: 'number' },
            totalLarkRecords: { type: 'number' },
            created: { type: 'number' },
            updated: { type: 'number' },
            deleted: { type: 'number' },
            errors: { type: 'number' },
            startTime: { type: 'string' },
            endTime: { type: 'string' },
            duration: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Sync is already running',
  })
  async performFullSync() {
    try {
      this.logger.log('Full sync requested via API');

      const stats = await this.customerSyncService.performFullSync();

      return {
        success: true,
        message: 'Full sync completed successfully',
        data: stats,
      };
    } catch (error) {
      this.logger.error('Full sync failed via API:', error.message);

      if (error.message.includes('already running')) {
        throw new BadRequestException(
          'Sync is already running. Please wait for it to complete.',
        );
      }

      throw new BadRequestException(`Full sync failed: ${error.message}`);
    }
  }

  @Post('incremental-sync')
  @ApiOperation({
    summary: 'Perform incremental sync',
    description: 'Đồng bộ chỉ những khách hàng đã thay đổi kể từ lần sync cuối',
  })
  @ApiResponse({
    status: 200,
    description: 'Incremental sync completed successfully',
  })
  async performIncrementalSync() {
    try {
      this.logger.log('Incremental sync requested via API');

      const stats = await this.customerSyncService.performIncrementalSync();

      return {
        success: true,
        message: 'Incremental sync completed successfully',
        data: stats,
      };
    } catch (error) {
      this.logger.error('Incremental sync failed via API:', error.message);
      throw new BadRequestException(
        `Incremental sync failed: ${error.message}`,
      );
    }
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get sync status',
    description: 'Lấy trạng thái hiện tại của hệ thống đồng bộ',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            isRunning: { type: 'boolean' },
            lastFullSyncDate: { type: 'string', nullable: true },
            totalMappings: { type: 'number' },
          },
        },
      },
    },
  })
  getSyncStatus() {
    const status = this.customerSyncService.getSyncStatus();

    return {
      success: true,
      data: status,
    };
  }

  @Post('webhook/kiotviet-customer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'KiotViet Customer Webhook',
    description:
      'Webhook endpoint để nhận thông báo thay đổi khách hàng từ KiotViet',
  })
  @ApiHeader({
    name: 'X-Hub-Signature',
    description: 'Webhook signature for verification',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid signature',
  })
  async handleKiotVietCustomerWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature') signature: string,
    @Body() webhookData: any,
  ) {
    try {
      this.logger.log('Received KiotViet customer webhook');

      // Verify webhook signature
      const rawBody =
        request.rawBody?.toString('utf8') || JSON.stringify(webhookData);

      if (
        !this.kiotVietService.validateWebhookSignature(
          rawBody,
          signature,
          this.webhookSecret,
        )
      ) {
        this.logger.warn('Invalid webhook signature received');
        throw new BadRequestException('Invalid signature');
      }

      this.logger.log('Webhook signature verified successfully');

      // Process webhook data
      await this.customerSyncService.handleCustomerWebhook(webhookData);

      this.logger.log('KiotViet customer webhook processed successfully');

      return {
        success: true,
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      this.logger.error(
        'Failed to process KiotViet customer webhook:',
        error.message,
      );

      if (error.message.includes('Invalid signature')) {
        throw new BadRequestException('Invalid signature');
      }

      throw new BadRequestException(
        `Webhook processing failed: ${error.message}`,
      );
    }
  }

  @Post('test-webhook')
  @ApiOperation({
    summary: 'Test webhook (Development only)',
    description:
      'Test endpoint để kiểm tra webhook processing mà không cần signature verification',
  })
  async testWebhook(@Body() webhookData: any) {
    try {
      this.logger.log('Processing test webhook data');

      await this.customerSyncService.handleCustomerWebhook(webhookData);

      return {
        success: true,
        message: 'Test webhook processed successfully',
      };
    } catch (error) {
      this.logger.error('Test webhook processing failed:', error.message);
      throw new BadRequestException(`Test webhook failed: ${error.message}`);
    }
  }

  @Get('test-kiotviet')
  @ApiOperation({
    summary: 'Test KiotViet connection',
    description:
      'Test if KiotViet credentials are working properly with OAuth2 authentication',
  })
  @ApiResponse({
    status: 200,
    description: 'KiotViet connection test result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'number' },
        totalCustomers: { type: 'number' },
        sampleCustomers: { type: 'array' },
        message: { type: 'string' },
      },
    },
  })
  async testKiotVietConnection() {
    try {
      this.logger.log('🧪 Testing KiotViet connection with OAuth2...');

      // Use the service's built-in test method
      const result = await this.kiotVietService.testConnection();

      if (result.success) {
        this.logger.log('✅ KiotViet connection successful!');
      } else {
        this.logger.error('❌ KiotViet connection failed!');
      }

      return result;
    } catch (error) {
      this.logger.error('❌ KiotViet connection test failed:', error.message);

      return {
        success: false,
        error: error.message,
        message: 'KiotViet connection test failed!',
        troubleshooting: {
          checkCredentials:
            'Verify KIOTVIET_RETAILER_NAME, KIOTVIET_CLIENT_ID, KIOTVIET_CLIENT_SECRET in .env',
          checkNetwork:
            'Ensure server can reach https://id.kiotviet.vn and https://public.kiotapi.com',
          checkPermissions: 'Verify client has PublicApi.Access scope',
        },
      };
    }
  }

  @Get('test-lark')
  @ApiOperation({
    summary: 'Test Lark Base connection',
    description:
      'Test if Lark credentials and Base access are working with auto token refresh',
  })
  async testLarkConnection() {
    try {
      this.logger.log(
        '🧪 Testing Lark Base connection with auto token refresh...',
      );

      // Use the service's built-in test method (with auto token refresh)
      const result = await this.larkService.testConnection();

      if (result.success) {
        this.logger.log('✅ Lark Base connection successful!');
      } else {
        this.logger.error('❌ Lark Base connection failed!');
      }

      return result;
    } catch (error) {
      this.logger.error('❌ Lark Base connection test failed:', error.message);

      return {
        success: false,
        error: error.message,
        message: 'Lark Base connection test failed!',
        troubleshooting: {
          checkCredentials: 'Verify LARK_APP_ID and LARK_APP_SECRET in .env',
          checkPermissions:
            'Verify app has bitable permissions and is published',
          checkBaseAccess: 'Ensure app has access to the specific Base',
        },
        setupRequired: true,
      };
    }
  }

  @Post('manual-customer-sync')
  @ApiOperation({
    summary: 'Manual sync single customer',
    description: 'Đồng bộ thủ công một khách hàng cụ thể bằng customer ID',
  })
  async manualCustomerSync(@Body('customerId') customerId: number) {
    try {
      this.logger.log(`Manual sync requested for customer ID: ${customerId}`);

      if (!customerId) {
        throw new BadRequestException('Customer ID is required');
      }

      // Fetch customer from KiotViet
      const customer = await this.kiotVietService.getCustomerById(customerId);

      // Create mock webhook data for processing
      const webhookData = {
        Id: 'manual-sync',
        Attempt: 1,
        Notifications: [
          {
            Action: 'update',
            Data: [customer],
          },
        ],
      };

      await this.customerSyncService.handleCustomerWebhook(webhookData);

      return {
        success: true,
        message: `Customer ${customerId} synced successfully`,
        data: {
          customerId: customer.id,
          customerCode: customer.code,
          customerName: customer.name,
        },
      };
    } catch (error) {
      this.logger.error(
        `Manual customer sync failed for ID ${customerId}:`,
        error.message,
      );
      throw new BadRequestException(`Manual sync failed: ${error.message}`);
    }
  }
}
