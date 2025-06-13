// THAY THẾ TOÀN BỘ file: src/integrations/lark/lark.service.ts
// Fixed version với Singapore domain và debug methods

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

  // 🚨 FIX: Sử dụng Singapore domain thay vì global domain
  private readonly baseUrl =
    'https://open.sg.larksuite.com/open-apis/bitable/v1';
  private readonly authUrl = 'https://open.sg.larksuite.com/open-apis/auth/v3';

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
      baseURL: this.baseUrl,
      timeout: 30000,
    });

    this.logger.log(
      'Lark Service initialized with Singapore domain and auto token refresh',
    );
  }

  private getLarkCredentials(): LarkCredentials {
    const appId = this.configService.get<string>('LARK_APP_ID');
    const appSecret = this.configService.get<string>('LARK_APP_SECRET');

    if (!appId || !appSecret) {
      throw new Error(
        'Please set LARK_APP_ID and LARK_APP_SECRET environment variables. ' +
          'You can get these from Lark Developer Console -> App Settings -> Credentials.',
      );
    }

    return { appId, appSecret };
  }

  private async obtainAppAccessToken(
    credentials: LarkCredentials,
  ): Promise<StoredLarkToken> {
    this.logger.log('Obtaining new app access token from Lark Singapore');

    try {
      const requestBody = {
        app_id: credentials.appId,
        app_secret: credentials.appSecret,
      };

      const response: AxiosResponse<LarkTokenResponse> = await axios.post(
        `${this.authUrl}/app_access_token/internal`,
        requestBody,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );

      if (response.data.code !== 0) {
        throw new Error(`Lark API error: ${response.data.msg}`);
      }

      const tokenData = response.data;
      const expiresAt = new Date(Date.now() + (tokenData.expire - 300) * 1000); // 5 minutes buffer

      const storedToken: StoredLarkToken = {
        accessToken: tokenData.app_access_token!,
        expiresAt: expiresAt,
        tokenType: 'app',
      };

      this.logger.log(
        `Successfully obtained Lark app access token. Expires at: ${expiresAt.toISOString()}`,
      );
      return storedToken;
    } catch (error) {
      this.logger.error(
        'Failed to obtain Lark app access token:',
        error.message,
      );
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
      };
    } catch (error) {
      this.logger.error('❌ Failed to get Base info:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to access Base',
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
        expectedTableId: this.tableId,
        message: `Found ${tables.length} tables in Base`,
      };
    } catch (error) {
      this.logger.error('❌ Failed to list tables:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to list tables',
      };
    }
  }

  /**
   * Convert KiotViet customer to Lark record format
   */
  private convertCustomerToLarkRecord(customer: KiotVietCustomer): any {
    const fields: any = {};

    // Map customer code
    if (customer.code) {
      fields[this.fieldIds.customerCode] = customer.code;
    }

    // Map customer name
    if (customer.name) {
      fields[this.fieldIds.customerName] = customer.name;
    }

    // Map gender (KiotViet: true=male, false=female, null/undefined=unknown)
    if (customer.gender !== null && customer.gender !== undefined) {
      fields[this.fieldIds.gender] = customer.gender
        ? this.genderOptions.male
        : this.genderOptions.female;
    }

    return { fields };
  }

  /**
   * Test Lark connection with comprehensive diagnostics
   */
  async testConnection(): Promise<any> {
    try {
      await this.setupAuthHeaders();

      this.logger.log(
        'Testing Lark Base connection with comprehensive diagnostics...',
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
            checkDomain: 'Using Singapore domain: open.sg.larksuite.com',
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
          domain: 'open.sg.larksuite.com',
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
        `Successfully fetched all ${allRecords.length} records from Lark Base`,
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
   * Batch create records in Lark Base
   */
  async batchCreateRecords(
    customers: KiotVietCustomer[],
  ): Promise<LarkRecord[]> {
    try {
      await this.setupAuthHeaders();

      this.logger.log(`Creating ${customers.length} records in Lark Base`);

      const allCreatedRecords: LarkRecord[] = [];
      const batchSize = 100; // Lark API limit

      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);

        const requestBody: LarkBatchCreateRequest = {
          records: batch.map((customer) =>
            this.convertCustomerToLarkRecord(customer),
          ),
        };

        const url = `/apps/${this.baseId}/tables/${this.tableId}/records/batch_create`;

        const response =
          await this.axiosInstance.post<LarkBatchOperationResponse>(
            url,
            requestBody,
          );

        if (response.data.code !== 0) {
          throw new Error(`Lark API error: ${response.data.msg}`);
        }

        allCreatedRecords.push(...response.data.data.records);

        this.logger.log(
          `Created batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records`,
        );

        // Small delay to avoid rate limiting
        if (i + batchSize < customers.length) {
          await this.delay(200);
        }
      }

      this.logger.log(
        `Successfully created ${allCreatedRecords.length} records in Lark Base`,
      );
      return allCreatedRecords;
    } catch (error) {
      this.logger.error(
        'Failed to create records in Lark Base:',
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

      this.logger.log(`Updating ${updates.length} records in Lark Base`);

      const allUpdatedRecords: LarkRecord[] = [];
      const batchSize = 100;

      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);

        const requestBody: LarkBatchUpdateRequest = {
          records: batch.map((update) => ({
            record_id: update.recordId,
            ...this.convertCustomerToLarkRecord(update.customer),
          })),
        };

        const url = `/apps/${this.baseId}/tables/${this.tableId}/records/batch_update`;

        const response =
          await this.axiosInstance.post<LarkBatchOperationResponse>(
            url,
            requestBody,
          );

        if (response.data.code !== 0) {
          throw new Error(`Lark API error: ${response.data.msg}`);
        }

        allUpdatedRecords.push(...response.data.data.records);

        this.logger.log(
          `Updated batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records`,
        );

        if (i + batchSize < updates.length) {
          await this.delay(200);
        }
      }

      this.logger.log(
        `Successfully updated ${allUpdatedRecords.length} records in Lark Base`,
      );
      return allUpdatedRecords;
    } catch (error) {
      this.logger.error(
        'Failed to update records in Lark Base:',
        error.message,
      );
      throw new HttpException(
        `Failed to update records in Lark: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Find record by customer code
   */
  async findRecordByCustomerCode(
    customerCode: string,
  ): Promise<LarkRecord | null> {
    try {
      await this.setupAuthHeaders();

      const url = `/apps/${this.baseId}/tables/${this.tableId}/records/search`;

      const requestBody = {
        field_names: [this.fieldIds.customerCode],
        filter: {
          conditions: [
            {
              field_name: this.fieldIds.customerCode,
              operator: 'is',
              value: [customerCode],
            },
          ],
        },
      };

      const response = await this.axiosInstance.post<LarkListRecordsResponse>(
        url,
        requestBody,
      );

      if (response.data.code !== 0) {
        throw new Error(`Lark API error: ${response.data.msg}`);
      }

      const records = response.data.data.items;
      return records.length > 0 ? records[0] : null;
    } catch (error) {
      this.logger.error(
        `Failed to find record by customer code ${customerCode}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Delete records by record IDs
   */
  async batchDeleteRecords(recordIds: string[]): Promise<void> {
    try {
      await this.setupAuthHeaders();

      this.logger.log(`Deleting ${recordIds.length} records from Lark Base`);

      const batchSize = 100;

      for (let i = 0; i < recordIds.length; i += batchSize) {
        const batch = recordIds.slice(i, i + batchSize);

        const url = `/apps/${this.baseId}/tables/${this.tableId}/records/batch_delete`;
        const requestBody = { records: batch };

        const response = await this.axiosInstance.post(url, requestBody);

        if (response.data.code !== 0) {
          throw new Error(`Lark API error: ${response.data.msg}`);
        }

        this.logger.log(
          `Deleted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records`,
        );

        if (i + batchSize < recordIds.length) {
          await this.delay(200);
        }
      }

      this.logger.log(
        `Successfully deleted ${recordIds.length} records from Lark Base`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to delete records from Lark Base:',
        error.message,
      );
      throw new HttpException(
        `Failed to delete records from Lark: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
