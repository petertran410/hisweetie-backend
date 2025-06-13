// src/integrations/lark/lark.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { KiotVietCustomer } from '../kiotviet/kiotviet.service';

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

@Injectable()
export class LarkService {
  private readonly logger = new Logger(LarkService.name);
  private readonly baseUrl = 'https://open.larksuite.com/open-apis/bitable/v1';

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

  private accessToken: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.accessToken = this.configService.get<string>('LARK_ACCESS_TOKEN');

    if (!this.accessToken) {
      this.logger.warn('LARK_ACCESS_TOKEN not configured');
    }
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
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
   * Get all records from Lark Base
   */
  async getAllRecords(): Promise<LarkRecord[]> {
    try {
      this.logger.log('Fetching all records from Lark Base');

      const allRecords: LarkRecord[] = [];
      let pageToken: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const url = `${this.baseUrl}/apps/${this.baseId}/tables/${this.tableId}/records`;
        const params: any = {
          view_id: this.viewId,
          page_size: '500', // Max allowed by Lark
        };

        if (pageToken) {
          params.page_token = pageToken;
        }

        const response = await firstValueFrom(
          this.httpService.get<LarkListRecordsResponse>(url, {
            headers: this.getHeaders(),
            params,
          }),
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

        const url = `${this.baseUrl}/apps/${this.baseId}/tables/${this.tableId}/records/batch_create`;

        const response = await firstValueFrom(
          this.httpService.post<LarkBatchOperationResponse>(url, requestBody, {
            headers: this.getHeaders(),
          }),
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

        const url = `${this.baseUrl}/apps/${this.baseId}/tables/${this.tableId}/records/batch_update`;

        const response = await firstValueFrom(
          this.httpService.post<LarkBatchOperationResponse>(url, requestBody, {
            headers: this.getHeaders(),
          }),
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
      const url = `${this.baseUrl}/apps/${this.baseId}/tables/${this.tableId}/records/search`;

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

      const response = await firstValueFrom(
        this.httpService.post<LarkListRecordsResponse>(url, requestBody, {
          headers: this.getHeaders(),
        }),
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
      this.logger.log(`Deleting ${recordIds.length} records from Lark Base`);

      const batchSize = 100;

      for (let i = 0; i < recordIds.length; i += batchSize) {
        const batch = recordIds.slice(i, i + batchSize);

        const url = `${this.baseUrl}/apps/${this.baseId}/tables/${this.tableId}/records/batch_delete`;
        const requestBody = { records: batch };

        const response = await firstValueFrom(
          this.httpService.post(url, requestBody, {
            headers: this.getHeaders(),
          }),
        );

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
