// THAY THẾ TOÀN BỘ file: src/integrations/lark/lark.service.ts
// Fixed version với multi-domain support và improved error handling

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { KiotVietCustomer } from '../kiotviet/kiotviet.service';

interface LarkCredentials {
  appId: string;
  appSecret: string;
}

interface LarkTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  app_access_token?: string;
  expire: number;
}

interface StoredLarkToken {
  accessToken: string;
  expiresAt: Date;
  tokenType: 'tenant' | 'app';
}

export interface LarkRecord {
  record_id?: string;
  fields: {
    [fieldId: string]: any;
  };
}

export interface LarkBatchCreateRequest {
  records: Array<{
    fields: {
      [fieldId: string]: any;
    };
  }>;
}

export interface LarkBatchUpdateRequest {
  records: Array<{
    record_id: string;
    fields: {
      [fieldId: string]: any;
    };
  }>;
}

export interface LarkListRecordsResponse {
  code: number;
  msg: string;
  data: {
    has_more: boolean;
    page_token?: string;
    total: number;
    items: LarkRecord[];
  };
}

export interface LarkBatchOperationResponse {
  code: number;
  msg: string;
  data: {
    records: LarkRecord[];
  };
}

export interface LarkBaseInfo {
  code: number;
  msg: string;
  data: {
    app: {
      app_token: string;
      name: string;
      folder_token: string;
      url: string;
    };
  };
}

export interface LarkTablesResponse {
  code: number;
  msg: string;
  data: {
    has_more: boolean;
    page_token?: string;
    items: Array<{
      table_id: string;
      name: string;
      description?: string;
    }>;
  };
}

@Injectable()
export class LarkService {
  private readonly logger = new Logger(LarkService.name);

  // 🔧 FIXED: Multiple domain support
  private readonly domains = {
    singapore: {
      baseUrl: 'https://open.sg.larksuite.com/open-apis/bitable/v1',
      authUrl: 'https://open.sg.larksuite.com/open-apis/auth/v3',
    },
    global: {
      baseUrl: 'https://open.larksuite.com/open-apis/bitable/v1',
      authUrl: 'https://open.larksuite.com/open-apis/auth/v3',
    },
  };

  // 🔧 Current domain configuration
  private currentDomain = this.domains.global; // Start with global domain

  // Lark Base configuration từ user
  private readonly baseId = 'Zythb8m0ba8a5WsgEMBlJtzCgpK';
  private readonly tableId = 'tbl0XzMnEuod7YPA';
  private readonly viewId = 'vewaSpQFOA';

  // Field IDs từ Bảng Khách Hàng.txt
  private readonly fieldIds = {
    id: 'fldGVtW2LC', // Id (Primary)
    customerCode: 'fldW0iwzXc', // Mã Khách Hàng
    customerName: 'fldPhKUyjp', // Tên Khách Hàng
    gender: 'fldXAZfN19', // Giới tính
  };

  private readonly genderOptions = {
    male: 'optyGBt7EU', // nam
    female: 'optq1lTuim', // nữ
  };

  private axiosInstance: AxiosInstance;
  private currentToken: StoredLarkToken | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Create axios instance for Lark API calls
    this.axiosInstance = axios.create({
      baseURL: this.currentDomain.baseUrl,
      timeout: 30000,
    });

    this.logger.log(
      `Lark Service initialized with domain: ${this.getCurrentDomainName()}`,
    );
  }

  private getCurrentDomainName(): string {
    return this.currentDomain === this.domains.singapore
      ? 'Singapore'
      : 'Global';
  }

  private switchDomain(): void {
    this.currentDomain =
      this.currentDomain === this.domains.singapore
        ? this.domains.global
        : this.domains.singapore;

    this.axiosInstance.defaults.baseURL = this.currentDomain.baseUrl;
    this.currentToken = null; // Reset token when switching domains

    this.logger.log(`🔄 Switched to ${this.getCurrentDomainName()} domain`);
  }

  private getLarkCredentials(): LarkCredentials {
    const appId = this.configService.get<string>('LARK_APP_ID');
    const appSecret = this.configService.get<string>('LARK_APP_SECRET');

    if (!appId || !appSecret) {
      throw new Error(
        'Please set LARK_APP_ID and LARK_APP_SECRET environment variables.\n' +
          'You can get these from Lark Developer Console -> App Settings -> Credentials.\n' +
          'Make sure your app is published and has bitable permissions.',
      );
    }

    return { appId, appSecret };
  }

  private async obtainAppAccessToken(
    credentials: LarkCredentials,
    retryWithOtherDomain = true,
  ): Promise<StoredLarkToken> {
    this.logger.log(
      `Obtaining app access token from Lark ${this.getCurrentDomainName()}`,
    );

    try {
      const requestBody = {
        app_id: credentials.appId,
        app_secret: credentials.appSecret,
      };

      this.logger.debug(`🔑 Using credentials:`, {
        app_id: credentials.appId,
        domain: this.getCurrentDomainName(),
        endpoint: `${this.currentDomain.authUrl}/app_access_token/internal`,
      });

      const response: AxiosResponse<LarkTokenResponse> = await axios.post(
        `${this.currentDomain.authUrl}/app_access_token/internal`,
        requestBody,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        },
      );

      if (response.data.code !== 0) {
        throw new Error(
          `Lark API error: ${response.data.msg} (code: ${response.data.code})`,
        );
      }

      const tokenData = response.data;
      const expiresAt = new Date(Date.now() + (tokenData.expire - 300) * 1000); // 5 minutes buffer

      const storedToken: StoredLarkToken = {
        accessToken: tokenData.app_access_token!,
        expiresAt: expiresAt,
        tokenType: 'app',
      };

      this.logger.log(
        `✅ Successfully obtained Lark app access token from ${this.getCurrentDomainName()} domain. Expires at: ${expiresAt.toISOString()}`,
      );
      return storedToken;
    } catch (error) {
      this.logger.error(
        `❌ Failed to obtain Lark app access token from ${this.getCurrentDomainName()} domain:`,
        {
          error: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        },
      );

      // 🔄 Try other domain if this is first attempt and we get 404
      if (retryWithOtherDomain && error.response?.status === 404) {
        this.logger.log(`🔄 404 error detected, trying other domain...`);
        this.switchDomain();
        return this.obtainAppAccessToken(credentials, false); // Don't retry again
      }

      throw new HttpException(
        `Failed to authenticate with Lark: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async getValidAccessToken(): Promise<string> {
    const credentials = this.getLarkCredentials();

    if (this.currentToken && new Date() < this.currentToken.expiresAt) {
      this.logger.debug('Using cached Lark access token');
      return this.currentToken.accessToken;
    }

    this.logger.log(
      'Lark access token expired or missing, obtaining new token',
    );
    this.currentToken = await this.obtainAppAccessToken(credentials);
    return this.currentToken.accessToken;
  }

  private async setupAuthHeaders(): Promise<void> {
    const accessToken = await this.getValidAccessToken();
    this.axiosInstance.defaults.headers.common['Authorization'] =
      `Bearer ${accessToken}`;
  }

  /**
   * 🔧 DEBUG: Get Base info to verify access
   */
  async getBaseInfo(): Promise<any> {
    try {
      await this.setupAuthHeaders();

      this.logger.log(`Getting Base info for: ${this.baseId}`);

      const url = `/apps/${this.baseId}`;
      const response = await this.axiosInstance.get<LarkBaseInfo>(url);

      if (response.data.code !== 0) {
        throw new Error(`Lark API error: ${response.data.msg}`);
      }

      this.logger.log('✅ Base info retrieved successfully');
      return {
        success: true,
        baseInfo: response.data.data.app,
        message: 'Base access verified',
        domain: this.getCurrentDomainName(),
      };
    } catch (error) {
      this.logger.error('❌ Failed to get Base info:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to access Base',
        domain: this.getCurrentDomainName(),
      };
    }
  }

  /**
   * 🔧 DEBUG: List all tables in Base to verify table ID
   */
  async listTables(): Promise<any> {
    try {
      await this.setupAuthHeaders();

      this.logger.log(`Listing all tables in Base: ${this.baseId}`);

      const url = `/apps/${this.baseId}/tables`;
      const response = await this.axiosInstance.get<LarkTablesResponse>(url);

      if (response.data.code !== 0) {
        throw new Error(`Lark API error: ${response.data.msg}`);
      }

      const tables = response.data.data.items;
      this.logger.log(`✅ Found ${tables.length} tables in Base`);

      // Check if our target table exists
      const targetTable = tables.find(
        (table) => table.table_id === this.tableId,
      );

      return {
        success: true,
        tables: tables,
        targetTableFound: !!targetTable,
        targetTable: targetTable,
        domain: this.getCurrentDomainName(),
      };
    } catch (error) {
      this.logger.error('❌ Failed to list tables:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to list tables',
        domain: this.getCurrentDomainName(),
      };
    }
  }

  /**
   * 🧪 TEST: Comprehensive connection test with auto-recovery
   */
  async testConnection(): Promise<any> {
    try {
      this.logger.log(
        `🧪 Testing Lark connection with ${this.getCurrentDomainName()} domain...`,
      );

      // Step 1: Test Base access
      const baseInfo = await this.getBaseInfo();
      if (!baseInfo.success) {
        return {
          success: false,
          step: 'base_access',
          error: baseInfo.error,
          message: 'Cannot access Base. Check app permissions.',
          troubleshooting: {
            checkAppPermissions:
              'Verify app has been granted access to this specific Base',
            checkBaseId: `Verify Base ID: ${this.baseId}`,
            checkDomain: `Current domain: ${this.getCurrentDomainName()}`,
            checkCredentials:
              'Verify LARK_APP_ID and LARK_APP_SECRET are correct',
            checkAppStatus: 'Ensure app is published in Lark Developer Console',
          },
        };
      }

      // Step 2: List tables to verify table ID
      const tablesInfo = await this.listTables();
      if (!tablesInfo.success) {
        return {
          success: false,
          step: 'list_tables',
          error: tablesInfo.error,
          message: 'Cannot list tables in Base',
          baseInfo: baseInfo.baseInfo,
        };
      }

      if (!tablesInfo.targetTableFound) {
        return {
          success: false,
          step: 'table_verification',
          message: `Table ID ${this.tableId} not found in Base`,
          availableTables: tablesInfo.tables,
          expectedTableId: this.tableId,
          troubleshooting: {
            checkTableId: 'Verify the correct Table ID from Lark Base URL',
            availableTableIds: tablesInfo.tables.map((t) => t.table_id),
          },
        };
      }

      // Step 3: Test actual record access
      const url = `/apps/${this.baseId}/tables/${this.tableId}/records`;
      const params = {
        view_id: this.viewId,
        page_size: '5',
      };

      const response = await this.axiosInstance.get<LarkListRecordsResponse>(
        url,
        { params },
      );

      if (response.data.code !== 0) {
        throw new Error(`Lark API error: ${response.data.msg}`);
      }

      this.logger.log('✅ Lark Base connection test successful!');

      return {
        success: true,
        status: response.status,
        totalRecords: response.data.data.total || 0,
        sampleRecords: response.data.data.items?.slice(0, 2) || [],
        message: 'Lark Base connection test successful!',
        baseConfig: {
          baseId: this.baseId,
          tableId: this.tableId,
          viewId: this.viewId,
          domain: this.getCurrentDomainName(),
          currentDomainUrl: this.currentDomain.baseUrl,
        },
        baseInfo: baseInfo.baseInfo,
        tableInfo: tablesInfo.targetTable,
      };
    } catch (error) {
      this.logger.error('❌ Lark Base connection test failed:', error.message);

      return {
        success: false,
        step: 'record_access',
        error: error.message,
        message: 'Lark Base connection test failed!',
        troubleshooting: {
          checkCredentials: 'Verify LARK_APP_ID and LARK_APP_SECRET in .env',
          checkPermissions:
            'Verify app has bitable permissions and is published',
          checkBaseAccess: 'Ensure app has access to the specific Base',
          checkTableId: `Verify Table ID: ${this.tableId}`,
          checkViewId: `Verify View ID: ${this.viewId}`,
          currentDomain: this.getCurrentDomainName(),
        },
      };
    }
  }

  /**
   * Get all records from Lark Base
   */
  async getAllRecords(): Promise<LarkRecord[]> {
    try {
      await this.setupAuthHeaders();

      this.logger.log('Fetching all records from Lark Base');

      const allRecords: LarkRecord[] = [];
      let pageToken: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const url = `/apps/${this.baseId}/tables/${this.tableId}/records`;
        const params: any = {
          view_id: this.viewId,
          page_size: '500', // Max allowed by Lark
        };

        if (pageToken) {
          params.page_token = pageToken;
        }

        const response = await this.axiosInstance.get<LarkListRecordsResponse>(
          url,
          { params },
        );

        if (response.data.code !== 0) {
          throw new Error(`Lark API error: ${response.data.msg}`);
        }

        const { items, has_more, page_token } = response.data.data;
        allRecords.push(...items);

        hasMore = has_more;
        pageToken = page_token;

        this.logger.log(
          `Fetched ${items.length} records. Total so far: ${allRecords.length}`,
        );
      }

      this.logger.log(
        `✅ Fetched total ${allRecords.length} records from Lark`,
      );
      return allRecords;
    } catch (error) {
      this.logger.error(
        'Failed to fetch records from Lark Base:',
        error.message,
      );
      throw new HttpException(
        `Failed to fetch records from Lark: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Convert KiotViet customer to Lark record format
   */
  private kiotVietToLarkRecord(customer: KiotVietCustomer): any {
    // Determine gender option ID
    let genderValue = null;
    if (customer.gender === 'Male' || customer.gender === 'Nam') {
      genderValue = this.genderOptions.male;
    } else if (customer.gender === 'Female' || customer.gender === 'Nữ') {
      genderValue = this.genderOptions.female;
    }

    return {
      fields: {
        [this.fieldIds.id]: customer.id.toString(),
        [this.fieldIds.customerCode]: customer.code || '',
        [this.fieldIds.customerName]: customer.name || '',
        [this.fieldIds.gender]: genderValue,
      },
    };
  }

  /**
   * Batch create records in Lark Base
   */
  async batchCreateRecords(
    customers: KiotVietCustomer[],
  ): Promise<LarkRecord[]> {
    try {
      await this.setupAuthHeaders();

      const records = customers.map((customer) =>
        this.kiotVietToLarkRecord(customer),
      );

      const url = `/apps/${this.baseId}/tables/${this.tableId}/records/batch_create`;
      const requestBody: LarkBatchCreateRequest = { records };

      this.logger.log(`Creating ${records.length} records in Lark Base`);

      const response =
        await this.axiosInstance.post<LarkBatchOperationResponse>(
          url,
          requestBody,
        );

      if (response.data.code !== 0) {
        throw new Error(`Lark API error: ${response.data.msg}`);
      }

      this.logger.log(
        `✅ Created ${response.data.data.records.length} records in Lark`,
      );
      return response.data.data.records;
    } catch (error) {
      this.logger.error(
        'Failed to batch create records in Lark:',
        error.message,
      );
      throw new HttpException(
        `Failed to create records in Lark: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Batch update records in Lark Base
   */
  async batchUpdateRecords(
    updates: Array<{ recordId: string; customer: KiotVietCustomer }>,
  ): Promise<LarkRecord[]> {
    try {
      await this.setupAuthHeaders();

      const records = updates.map((update) => ({
        record_id: update.recordId,
        ...this.kiotVietToLarkRecord(update.customer),
      }));

      const url = `/apps/${this.baseId}/tables/${this.tableId}/records/batch_update`;
      const requestBody: LarkBatchUpdateRequest = { records };

      this.logger.log(`Updating ${records.length} records in Lark Base`);

      const response =
        await this.axiosInstance.post<LarkBatchOperationResponse>(
          url,
          requestBody,
        );

      if (response.data.code !== 0) {
        throw new Error(`Lark API error: ${response.data.msg}`);
      }

      this.logger.log(
        `✅ Updated ${response.data.data.records.length} records in Lark`,
      );
      return response.data.data.records;
    } catch (error) {
      this.logger.error(
        'Failed to batch update records in Lark:',
        error.message,
      );
      throw new HttpException(
        `Failed to update records in Lark: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * 🔧 DIAGNOSTIC: Get current configuration and status
   */
  async getDiagnostics(): Promise<any> {
    const credentials = this.getLarkCredentials();

    return {
      configuration: {
        baseId: this.baseId,
        tableId: this.tableId,
        viewId: this.viewId,
        currentDomain: this.getCurrentDomainName(),
        domainUrl: this.currentDomain.baseUrl,
        authUrl: this.currentDomain.authUrl,
      },
      credentials: {
        appId: credentials.appId,
        hasAppSecret: !!credentials.appSecret,
        appSecretLength: credentials.appSecret?.length || 0,
      },
      tokenStatus: {
        hasToken: !!this.currentToken,
        tokenExpired: this.currentToken
          ? new Date() >= this.currentToken.expiresAt
          : null,
        expiresAt: this.currentToken?.expiresAt?.toISOString() || null,
      },
      fieldMapping: this.fieldIds,
      genderOptions: this.genderOptions,
    };
  }
}
