// THAY THẾ TOÀN BỘ file: src/integrations/lark/lark.service.ts
// Fixed version với đúng field mapping và complete CRUD operations

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

export interface LarkBatchDeleteRequest {
  records: string[]; // Array of record IDs
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

  // 🔧 Multiple domain support
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

  private currentDomain = this.domains.global; // Start with global domain

  // Lark Base configuration
  private readonly baseId = 'RgpFbW88iavwpNscUW2lQamOgtg';
  private readonly tableId = 'tbljJpHW18wYyTkI';
  private readonly viewId = 'vewIYQlgmu';

  // 🔧 COMPLETE Field mapping dựa trên Bảng Khách Hàng.txt và KiotViet API
  private readonly fieldIds = {
    // Basic Info
    id: 'fldr72pFQA', // Id (Primary)
    customerCode: 'fldcui5IWc', // Mã Khách Hàng
    customerName: 'fld4D781z6', // Tên Khách Hàng
    gender: 'fldYSkyalS', // Giới tính (Select field)

    // Contact Info
    phone: 'fldRIayaYe', // Số Điện Thoại
    email: 'fldoMPWPnC', // Email
    address: 'fldBxav8oZ', // Địa Chỉ
    locationArea: 'flda8DECHt', // Khu Vực (locationName from KiotViet)
    ward: 'fldJ4N74yG', // Phường Xã

    // Business Info
    company: 'fld89HfsM9', // Công Ty (organization)
    taxCode: 'fldiZjVChN', // Mã Số Thuế
    comments: 'fldQ0XGZB2', // Ghi Chú

    // Financial Info
    currentDebt: 'fldEJ3qsQu', // Nợ Hiện Tại (debt)
    totalSales: 'fld6sp6GiO', // Tổng Bán (totalInvoiced)
    currentPoints: 'fldtThsHzM', // Điểm Hiện Tại (totalPoint)

    // System Info
    retailerId: 'fldkvr7Rkz', // Id Cửa Hàng (retailerId)
    modifiedDate: 'fld2TV7kJd', // Thời Gian Cập Nhật
    createdDate: 'fldpLPIYMY', // Ngày Tạo
  };

  // 🔧 FIXED: Gender options cho Lark Select field
  private readonly genderOptions = {
    male: 'opt6L47AiX', // nam
    female: 'opt9betydF', // nữ
  };

  private axiosInstance: AxiosInstance;
  private currentToken: StoredLarkToken | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
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
      const expiresAt = new Date(Date.now() + (tokenData.expire - 300) * 1000);

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
        return this.obtainAppAccessToken(credentials, false);
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

      // Step 3: Test actual record access with detailed logging
      this.logger.log('🔍 Testing record access...');
      const url = `/apps/${this.baseId}/tables/${this.tableId}/records`;
      const params = {
        view_id: this.viewId,
        page_size: '5',
      };

      this.logger.debug(
        `📡 Testing with URL: ${this.currentDomain.baseUrl}${url}`,
      );
      this.logger.debug(`📡 Params:`, params);

      const response = await this.axiosInstance.get<LarkListRecordsResponse>(
        url,
        { params },
      );

      this.logger.debug(`📥 Raw response:`, {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
      });

      if (response.data.code !== 0) {
        throw new Error(
          `Lark API error: ${response.data.msg} (code: ${response.data.code})`,
        );
      }

      // 🔧 FIXED: Better validation of response structure
      const responseData = response.data.data;
      const items = responseData?.items || [];
      const total = responseData?.total || 0;

      this.logger.log(
        `✅ Lark Base connection test successful! Found ${total} total records, fetched ${items.length} sample records`,
      );

      return {
        success: true,
        status: response.status,
        totalRecords: total,
        sampleRecords: Array.isArray(items) ? items.slice(0, 2) : [],
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
        rawResponse: {
          code: response.data.code,
          msg: response.data.msg,
          hasData: !!responseData,
          itemsType: typeof items,
          itemsLength: Array.isArray(items) ? items.length : 'not_array',
        },
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
          possibleIssues: [
            'Base/Table is empty (no records)',
            'View permissions not granted',
            'Field permissions restricted',
            'App not granted access to specific Base',
          ],
        },
        errorDetails: error.response
          ? {
              status: error.response.status,
              data: error.response.data,
            }
          : null,
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

        this.logger.debug(`🔍 Requesting records with params:`, params);

        const response = await this.axiosInstance.get<LarkListRecordsResponse>(
          url,
          { params },
        );

        this.logger.debug(`📥 Lark API Response:`, {
          status: response.status,
          code: response.data?.code,
          msg: response.data?.msg,
          hasData: !!response.data?.data,
          dataKeys: response.data?.data ? Object.keys(response.data.data) : [],
        });

        if (response.data.code !== 0) {
          throw new Error(
            `Lark API error: ${response.data.msg} (code: ${response.data.code})`,
          );
        }

        // 🔧 FIXED: Defensive programming for missing/null items
        const responseData = response.data.data;
        if (!responseData) {
          this.logger.warn('⚠️ No data field in response, treating as empty');
          break;
        }

        const items = responseData.items || []; // Default to empty array if items is null/undefined
        const has_more = responseData.has_more || false;
        const page_token = responseData.page_token;

        // 🔧 FIXED: Safe spreading of items
        if (Array.isArray(items)) {
          allRecords.push(...items);
          this.logger.log(
            `Fetched ${items.length} records. Total so far: ${allRecords.length}`,
          );
        } else {
          this.logger.warn(`⚠️ Items is not an array:`, typeof items, items);
        }

        hasMore = has_more && items.length > 0;
        pageToken = page_token;

        // Safety break to prevent infinite loops
        if (allRecords.length > 10000) {
          this.logger.warn(
            '⚠️ Breaking loop - too many records, possible infinite loop',
          );
          break;
        }
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

      // 🔧 ADDED: More detailed error info
      if (error.response) {
        this.logger.error('Response details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        });
      }

      throw new HttpException(
        `Failed to fetch records from Lark: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * 🔧 FIXED: Convert KiotViet customer to Lark record format with proper field mapping
   */
  private kiotVietToLarkRecord(customer: KiotVietCustomer): any {
    // 🔧 FIXED: Handle gender properly - KiotViet returns boolean, convert to Lark option
    let genderValue: string | null = null; // 🔧 FIXED: Explicit type annotation
    if (customer.gender === true) {
      genderValue = this.genderOptions.male; // Assume true = male
    } else if (customer.gender === false) {
      genderValue = this.genderOptions.female; // Assume false = female
    }
    // If gender is undefined/null, leave as null

    return {
      fields: {
        [this.fieldIds.id]: customer.id.toString(),
        [this.fieldIds.customerCode]: customer.code || '',
        [this.fieldIds.customerName]: customer.name || '',
        [this.fieldIds.gender]: genderValue,
        [this.fieldIds.company]: customer.organization || '', // Map organization to Công Ty
        [this.fieldIds.comments]: customer.comments || '', // Map comments to Ghi Chú
        [this.fieldIds.taxCode]: customer.taxCode || '', // Map taxCode to Mã Số Thuế
        [this.fieldIds.currentDebt]: customer.debt || 0, // Map debt to Nợ Hiện Tại
        [this.fieldIds.totalSales]: customer.totalInvoiced || 0, // Map totalInvoiced to Tổng Bán
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
   * 🆕 ADDED: Batch delete records in Lark Base
   */
  async batchDeleteRecords(recordIds: string[]): Promise<void> {
    try {
      await this.setupAuthHeaders();

      if (recordIds.length === 0) {
        this.logger.log('No records to delete');
        return;
      }

      const url = `/apps/${this.baseId}/tables/${this.tableId}/records/batch_delete`;
      const requestBody: LarkBatchDeleteRequest = { records: recordIds };

      this.logger.log(`Deleting ${recordIds.length} records from Lark Base`);

      const response =
        await this.axiosInstance.post<LarkBatchOperationResponse>(
          url,
          requestBody,
        );

      if (response.data.code !== 0) {
        throw new Error(`Lark API error: ${response.data.msg}`);
      }

      this.logger.log(`✅ Deleted ${recordIds.length} records from Lark`);
    } catch (error) {
      this.logger.error(
        'Failed to batch delete records in Lark:',
        error.message,
      );
      throw new HttpException(
        `Failed to delete records in Lark: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * 🔧 DIAGNOSTIC: Get current configuration and status with complete field mapping
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
      // 🔧 COMPLETE field mapping info
      fieldMapping: {
        total: Object.keys(this.fieldIds).length,
        fields: this.fieldIds,
        categories: {
          basic: ['id', 'customerCode', 'customerName', 'gender'],
          contact: ['phone', 'email', 'address', 'locationArea', 'ward'],
          business: ['company', 'taxCode', 'comments'],
          financial: ['currentDebt', 'totalSales', 'currentPoints'],
          system: ['retailerId', 'modifiedDate', 'createdDate'],
        },
      },
      genderOptions: this.genderOptions,
      kiotVietMapping: {
        description: 'KiotViet API fields → Lark Base fields',
        mappings: {
          'id → fldr72pFQA': 'Id (Primary)',
          'code → fldcui5IWc': 'Mã Khách Hàng',
          'name → fld4D781z6': 'Tên Khách Hàng',
          'gender (boolean) → fldYSkyalS': 'Giới tính (Select)',
          'contactNumber → fldRIayaYe': 'Số Điện Thoại',
          'email → fldoMPWPnC': 'Email',
          'address → fldBxav8oZ': 'Địa Chỉ',
          'locationName → flda8DECHt': 'Khu Vực',
          'ward → fldJ4N74yG': 'Phường Xã',
          'organization → fld89HfsM9': 'Công Ty',
          'taxCode → fldiZjVChN': 'Mã Số Thuế',
          'comments → fldQ0XGZB2': 'Ghi Chú',
          'debt → fldEJ3qsQu': 'Nợ Hiện Tại',
          'totalInvoiced → fld6sp6GiO': 'Tổng Bán',
          'totalPoint → fldtThsHzM': 'Điểm Hiện Tại',
          'retailerId → fldkvr7Rkz': 'Id Cửa Hàng',
          'modifiedDate → fld2TV7kJd': 'Thời Gian Cập Nhật',
          'createdDate → fldpLPIYMY': 'Ngày Tạo',
        },
      },
    };
  }
}
