// src/integrations/kiotviet/kiotviet.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface KiotVietCustomer {
  id: number;
  code: string;
  name: string;
  gender?: boolean;
  birthDate?: string;
  contactNumber: string;
  address: string;
  locationName?: string;
  email: string;
  modifiedDate: string;
  type?: number;
  organization?: string;
  taxCode?: string;
  comments?: string;
  createdDate?: string;
  debt?: number;
  totalInvoiced?: number;
  totalPoint?: number;
  retailerId?: number;
}

export interface KiotVietCustomerResponse {
  total: number;
  pageSize: number;
  data: KiotVietCustomer[];
}

export interface KiotVietWebhookPayload {
  Id: string;
  Attempt: number;
  Notifications: Array<{
    Action: string;
    Data: KiotVietCustomer[];
  }>;
}

@Injectable()
export class KiotVietService {
  private readonly logger = new Logger(KiotVietService.name);
  private readonly baseUrl = 'https://public.kiotapi.com';
  private readonly retailerApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.retailerApiKey = this.configService.get<string>('KIOTVIET_API_KEY');

    if (!this.retailerApiKey) {
      this.logger.warn('KIOTVIET_API_KEY not configured');
    }
  }

  private getHeaders() {
    return {
      Retailer: this.retailerApiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get all customers from KiotViet with pagination
   */
  async getAllCustomers(): Promise<KiotVietCustomer[]> {
    try {
      this.logger.log('Starting to fetch all customers from KiotViet');

      const allCustomers: KiotVietCustomer[] = [];
      let currentItem = 0;
      const pageSize = 100; // Max allowed by KiotViet
      let hasMoreData = true;

      while (hasMoreData) {
        this.logger.log(
          `Fetching customers page: currentItem=${currentItem}, pageSize=${pageSize}`,
        );

        const url = `${this.baseUrl}/customers`;
        const params = {
          pageSize: pageSize.toString(),
          currentItem: currentItem.toString(),
          orderBy: 'modifiedDate',
          orderDirection: 'ASC',
        };

        const response = await firstValueFrom(
          this.httpService.get<KiotVietCustomerResponse>(url, {
            headers: this.getHeaders(),
            params,
          }),
        );

        const { data, total } = response.data;

        this.logger.log(`Fetched ${data.length} customers. Total: ${total}`);

        allCustomers.push(...data);
        currentItem += data.length;

        // Check if we have more data
        hasMoreData = currentItem < total && data.length === pageSize;

        // Add small delay to avoid rate limiting
        if (hasMoreData) {
          await this.delay(100);
        }
      }

      this.logger.log(
        `Successfully fetched all ${allCustomers.length} customers from KiotViet`,
      );
      return allCustomers;
    } catch (error) {
      this.logger.error(
        'Failed to fetch customers from KiotViet:',
        error.message,
      );
      throw new HttpException(
        `Failed to fetch customers from KiotViet: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: number): Promise<KiotVietCustomer> {
    try {
      this.logger.log(`Fetching customer by ID: ${customerId}`);

      const url = `${this.baseUrl}/customers/${customerId}`;

      const response = await firstValueFrom(
        this.httpService.get<KiotVietCustomer>(url, {
          headers: this.getHeaders(),
        }),
      );

      this.logger.log(
        `Successfully fetched customer ${customerId} from KiotViet`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch customer ${customerId} from KiotViet:`,
        error.message,
      );
      throw new HttpException(
        `Failed to fetch customer ${customerId}: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Get customers modified after a specific date
   */
  async getCustomersModifiedAfter(
    lastModifiedDate: string,
  ): Promise<KiotVietCustomer[]> {
    try {
      this.logger.log(`Fetching customers modified after: ${lastModifiedDate}`);

      const allCustomers: KiotVietCustomer[] = [];
      let currentItem = 0;
      const pageSize = 100;
      let hasMoreData = true;

      while (hasMoreData) {
        const url = `${this.baseUrl}/customers`;
        const params = {
          pageSize: pageSize.toString(),
          currentItem: currentItem.toString(),
          lastModifiedFrom: lastModifiedDate,
          orderBy: 'modifiedDate',
          orderDirection: 'ASC',
        };

        const response = await firstValueFrom(
          this.httpService.get<KiotVietCustomerResponse>(url, {
            headers: this.getHeaders(),
            params,
          }),
        );

        const { data, total } = response.data;
        allCustomers.push(...data);
        currentItem += data.length;

        hasMoreData = currentItem < total && data.length === pageSize;

        if (hasMoreData) {
          await this.delay(100);
        }
      }

      this.logger.log(
        `Fetched ${allCustomers.length} customers modified after ${lastModifiedDate}`,
      );
      return allCustomers;
    } catch (error) {
      this.logger.error(
        'Failed to fetch modified customers from KiotViet:',
        error.message,
      );
      throw new HttpException(
        `Failed to fetch modified customers: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch (error) {
      this.logger.error('Failed to validate webhook signature:', error.message);
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
