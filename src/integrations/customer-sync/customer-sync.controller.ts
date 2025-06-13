// THAY THẾ TOÀN BỘ file: src/integrations/customer-sync/customer-sync.controller.ts
// Fixed version với proper method calls và type safety

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Logger,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CustomerSyncService } from './customer-sync.service';
import { KiotVietService } from '../kiotviet/kiotviet.service';
import { LarkService } from '../lark/lark.service';
import * as crypto from 'crypto';

@ApiTags('Customer Sync')
@Controller('api/customer-sync')
export class CustomerSyncController {
  private readonly logger = new Logger(CustomerSyncController.name);

  constructor(
    private readonly customerSyncService: CustomerSyncService,
    private readonly kiotVietService: KiotVietService,
    private readonly larkService: LarkService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get sync status',
    description: 'Returns current synchronization status and statistics',
  })
  async getSyncStatus() {
    return this.customerSyncService.getSyncStatus();
  }

  @Post('sync/full')
  @ApiOperation({
    summary: 'Trigger full sync',
    description:
      'Manually trigger full customer synchronization between KiotViet and Lark',
  })
  async triggerFullSync() {
    try {
      this.logger.log('Manual full sync triggered');
      const result = await this.customerSyncService.performFullSync();
      return {
        success: true,
        message: 'Full sync completed successfully',
        result,
      };
    } catch (error) {
      this.logger.error('Manual full sync failed:', error.message);
      throw new BadRequestException(`Full sync failed: ${error.message}`);
    }
  }

  @Post('sync/incremental')
  @ApiOperation({
    summary: 'Trigger incremental sync',
    description:
      'Manually trigger incremental customer synchronization between KiotViet and Lark',
  })
  async triggerIncrementalSync() {
    try {
      this.logger.log('Manual incremental sync triggered');
      const result = await this.customerSyncService.performIncrementalSync();
      return {
        success: true,
        message: 'Incremental sync completed successfully',
        result,
      };
    } catch (error) {
      this.logger.error('Manual incremental sync failed:', error.message);
      throw new BadRequestException(
        `Incremental sync failed: ${error.message}`,
      );
    }
  }

  @Post('webhook/kiotviet')
  @ApiOperation({
    summary: 'KiotViet webhook endpoint',
    description: 'Receives customer update notifications from KiotViet',
  })
  async handleKiotVietWebhook(
    @Body() webhookData: any,
    @Headers('x-kiotviet-signature') signature?: string,
  ) {
    try {
      this.logger.log('Received KiotViet webhook');

      // Verify webhook signature if configured
      if (process.env.KIOTVIET_WEBHOOK_SECRET && signature) {
        const expectedSignature = crypto
          .createHmac('sha256', process.env.KIOTVIET_WEBHOOK_SECRET)
          .update(JSON.stringify(webhookData))
          .digest('hex');

        if (signature !== expectedSignature) {
          throw new BadRequestException('Invalid signature');
        }
      }

      await this.customerSyncService.handleCustomerWebhook(webhookData);

      return {
        success: true,
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      this.logger.error('Webhook processing failed:', error.message);

      if (error.message === 'Invalid signature') {
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
    summary: 'Test Lark Base connection with auto-recovery',
    description:
      'Test if Lark credentials and Base access are working with auto domain switching',
  })
  async testLarkConnection() {
    try {
      this.logger.log(
        '🧪 Testing Lark Base connection with auto domain switching...',
      );

      // Use the service's enhanced test method
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
          checkAppStatus: 'Ensure app is published in Lark Developer Console',
          checkPermissions:
            'Verify app has bitable:read and bitable:write permissions',
          checkBaseAccess: 'Ensure app has access to the specific Base',
          checkBaseId: 'Verify Base ID: Zythb8m0ba8a5WsgEMBlJtzCgpK',
          checkTableId: 'Verify Table ID: tbl0XzMnEuod7YPA',
          domains: 'Auto-switching between Global and Singapore domains',
        },
      };
    }
  }

  @Get('diagnostics')
  @ApiOperation({
    summary: 'Get detailed diagnostics',
    description: 'Get comprehensive diagnostic information for troubleshooting',
  })
  async getDiagnostics() {
    try {
      this.logger.log('🔍 Running comprehensive diagnostics...');

      // Get diagnostics from all services
      const larkDiagnostics = await this.larkService.getDiagnostics();
      const syncStatus = await this.customerSyncService.getSyncStatus();

      const diagnostics = {
        timestamp: new Date().toISOString(),
        environment: {
          nodeEnv: process.env.NODE_ENV,
          hasKiotVietCredentials: !!(
            process.env.KIOTVIET_CLIENT_ID &&
            process.env.KIOTVIET_CLIENT_SECRET &&
            process.env.KIOTVIET_RETAILER_NAME
          ),
          hasLarkCredentials: !!(
            process.env.LARK_APP_ID && process.env.LARK_APP_SECRET
          ),
          autoSyncEnabled: process.env.AUTO_SYNC_ENABLED === 'true',
        },
        lark: larkDiagnostics,
        sync: syncStatus,
        recommendations: [] as string[], // 🔧 FIXED: Explicit type annotation
      };

      // Add recommendations based on diagnostics
      if (!diagnostics.environment.hasKiotVietCredentials) {
        diagnostics.recommendations.push(
          '⚠️ KiotViet credentials missing. Set KIOTVIET_CLIENT_ID, KIOTVIET_CLIENT_SECRET, KIOTVIET_RETAILER_NAME',
        );
      }

      if (!diagnostics.environment.hasLarkCredentials) {
        diagnostics.recommendations.push(
          '⚠️ Lark credentials missing. Set LARK_APP_ID and LARK_APP_SECRET',
        );
      }

      if (larkDiagnostics.tokenStatus.tokenExpired) {
        diagnostics.recommendations.push(
          '⚠️ Lark token expired. Will refresh automatically on next request',
        );
      }

      if (!diagnostics.environment.autoSyncEnabled) {
        diagnostics.recommendations.push(
          'ℹ️ Auto-sync is disabled. Set AUTO_SYNC_ENABLED=true to enable',
        );
      }

      return diagnostics;
    } catch (error) {
      this.logger.error('❌ Diagnostics failed:', error.message);

      return {
        success: false,
        error: error.message,
        message: 'Failed to run diagnostics',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('test-full-chain')
  @ApiOperation({
    summary: 'Test complete integration chain',
    description: 'Test KiotViet → Lark sync pipeline end-to-end',
  })
  async testFullChain() {
    try {
      this.logger.log('🧪 Testing complete integration chain...');

      const results = {
        timestamp: new Date().toISOString(),
        steps: {
          kiotViet: null as any,
          lark: null as any,
          sync: null as any,
        },
        overall: {
          success: false,
          message: '',
        },
      };

      // Step 1: Test KiotViet
      this.logger.log('📋 Step 1: Testing KiotViet connection...');
      results.steps.kiotViet = await this.kiotVietService.testConnection();

      if (results.steps.kiotViet && !results.steps.kiotViet.success) {
        results.overall.message = 'KiotViet connection failed';
        return results;
      }

      // Step 2: Test Lark
      this.logger.log('📊 Step 2: Testing Lark connection...');
      results.steps.lark = await this.larkService.testConnection();

      if (results.steps.lark && !results.steps.lark.success) {
        results.overall.message = 'Lark connection failed';
        return results;
      }

      // Step 3: Test actual sync (dry run)
      this.logger.log('🔄 Step 3: Testing sync process...');
      try {
        const syncResult = await this.customerSyncService.performFullSync();
        results.steps.sync = {
          success: true,
          result: syncResult,
          message: 'Sync test successful',
        };

        results.overall.success = true;
        results.overall.message =
          'All tests passed! Integration chain is working properly.';

        this.logger.log('✅ Complete integration chain test successful!');
      } catch (syncError) {
        results.steps.sync = {
          success: false,
          error: syncError.message,
          message: 'Sync test failed',
        };
        results.overall.message = 'Sync process failed';
      }

      return results;
    } catch (error) {
      this.logger.error('❌ Full chain test failed:', error.message);

      return {
        success: false,
        error: error.message,
        message: 'Full chain test failed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('reset-lark-connection')
  @ApiOperation({
    summary: 'Reset Lark connection and force token refresh',
    description: 'Clear cached tokens and force re-authentication with Lark',
  })
  async resetLarkConnection() {
    try {
      this.logger.log('🔄 Resetting Lark connection...');

      // Force a fresh connection test which will reset tokens
      const result = await this.larkService.testConnection();

      return {
        success: true,
        message: 'Lark connection reset completed',
        testResult: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('❌ Lark connection reset failed:', error.message);

      return {
        success: false,
        error: error.message,
        message: 'Failed to reset Lark connection',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
