// src/integrations/kiotviet/kiotviet.service.ts
// Updated to use existing KiotViet service architecture

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

interface KiotVietCredentials {
  retailerName: string;
  clientId: string;
  clientSecret: string;
}

interface KiotVietTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface StoredToken {
  accessToken: string;
  expiresAt: Date;
  tokenType: string;
}

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
  private readonly baseUrl: string;
  private readonly authUrl = 'https://id.kiotviet.vn/connect/token';
  private readonly maxRequestsPerHour = 5000;

  private axiosInstance: AxiosInstance;
  private currentToken: StoredToken | null = null;
  private requestCount = 0;
  private hourStartTime = Date.now();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('KIOT_BASE_URL') ||
      'https://public.kiotapi.com';

    // Create axios instance for KiotViet API calls
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });

    this.logger.log('KiotViet Service initialized with OAuth2 authentication');
  }

  private getCredentials(): KiotVietCredentials {
    const retailerName = this.configService.get<string>(
      'KIOTVIET_RETAILER_NAME',
    );
    const clientId = this.configService.get<string>('KIOTVIET_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'KIOTVIET_CLIENT_SECRET',
    );

    if (!retailerName || !clientId || !clientSecret) {
      throw new BadRequestException(
        'Please set KIOTVIET_RETAILER_NAME, KIOTVIET_CLIENT_ID, and KIOTVIET_CLIENT_SECRET environment variables.',
      );
    }

    return { retailerName, clientId, clientSecret };
  }

  private async obtainAccessToken(
    credentials: KiotVietCredentials,
  ): Promise<StoredToken> {
    this.logger.log('Obtaining new access token from KiotViet');

    try {
      const requestBody = new URLSearchParams();
      requestBody.append('scopes', 'PublicApi.Access');
      requestBody.append('grant_type', 'client_credentials');
      requestBody.append('client_id', credentials.clientId);
      requestBody.append('client_secret', credentials.clientSecret);

      const response: AxiosResponse<KiotVietTokenResponse> = await axios.post(
        this.authUrl,
        requestBody.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        },
      );

      const tokenData = response.data;
      const expiresAt = new Date(
        Date.now() + (tokenData.expires_in - 300) * 1000, // 5 minutes buffer
      );

      const storedToken: StoredToken = {
        accessToken: tokenData.access_token,
        expiresAt: expiresAt,
        tokenType: tokenData.token_type,
      };

      this.logger.log(
        `Successfully obtained access token. Expires at: ${expiresAt.toISOString()}`,
      );
      return storedToken;
    } catch (error) {
      this.logger.error('Failed to obtain access token:', error.message);
      if (error.response?.status === 400) {
        throw new BadRequestException('Invalid KiotViet client credentials.');
      } else if (error.response?.status === 401) {
        throw new BadRequestException(
          'Unauthorized: KiotViet client credentials are not valid.',
        );
      } else {
        throw new BadRequestException(
          `Failed to authenticate with KiotViet: ${error.message}`,
        );
      }
    }
  }

  private async getValidAccessToken(): Promise<string> {
    const credentials = this.getCredentials();

    if (this.currentToken && new Date() < this.currentToken.expiresAt) {
      this.logger.debug('Using cached access token');
      return this.currentToken.accessToken;
    }

    this.logger.log('Access token expired or missing, obtaining new token');
    this.currentToken = await this.obtainAccessToken(credentials);
    return this.currentToken.accessToken;
  }

  private async setupAuthHeaders(): Promise<void> {
    const accessToken = await this.getValidAccessToken();
    this.axiosInstance.defaults.headers.common['Authorization'] =
      `Bearer ${accessToken}`;
    this.axiosInstance.defaults.headers.common['Retailer'] =
      this.getCredentials().retailerName;
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();

    // Reset counter if an hour has passed
    if (now - this.hourStartTime > 3600000) {
      // 1 hour in milliseconds
      this.requestCount = 0;
      this.hourStartTime = now;
    }

    // Check if we're approaching the rate limit
    if (this.requestCount >= this.maxRequestsPerHour - 10) {
      const timeToWait = 3600000 - (now - this.hourStartTime) + 1000; // Wait until next hour + 1 second
      this.logger.warn(`Rate limit approaching. Waiting ${timeToWait}ms...`);
      await new Promise((resolve) => setTimeout(resolve, timeToWait));

      // Reset counters
      this.requestCount = 0;
      this.hourStartTime = Date.now();
    }

    this.requestCount++;
  }

  /**
   * Get all customers from KiotViet with pagination
   */
  async getAllCustomers(): Promise<KiotVietCustomer[]> {
    this.logger.log('Fetching all customers from KiotViet...');

    const allCustomers: KiotVietCustomer[] = [];
    let currentItem = 0;
    const pageSize = 100; // Max page size
    let hasMore = true;

    while (hasMore) {
      try {
        await this.checkRateLimit();
        await this.setupAuthHeaders();

        const params = {
          pageSize: pageSize.toString(),
          currentItem: currentItem.toString(),
        };

        const response = await this.axiosInstance.get<KiotVietCustomerResponse>(
          '/customers',
          { params },
        );

        const customers = response.data.data || [];
        allCustomers.push(...customers);

        this.logger.log(
          `Fetched ${customers.length} customers. Total so far: ${allCustomers.length}/${response.data.total}`,
        );

        // Check if we have more pages
        currentItem += customers.length;
        hasMore =
          customers.length === pageSize && currentItem < response.data.total;
      } catch (error) {
        this.logger.error(
          'Failed to fetch customers from KiotViet:',
          error.message,
        );
        throw new Error(
          `Failed to get customers from KiotViet: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `✅ Successfully fetched ${allCustomers.length} customers from KiotViet`,
    );
    return allCustomers;
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: number): Promise<KiotVietCustomer> {
    try {
      await this.setupAuthHeaders();
      await this.checkRateLimit();

      this.logger.log(`Fetching customer by ID: ${customerId}`);

      const response = await this.axiosInstance.get<KiotVietCustomer>(
        `/customers/${customerId}`,
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
      throw new BadRequestException(
        `Failed to fetch customer ${customerId}: ${error.message}`,
      );
    }
  }

  /**
   * Get customers modified after a specific date
   */
  async getCustomersModifiedAfter(
    lastModifiedDate: string,
  ): Promise<KiotVietCustomer[]> {
    this.logger.log(`Fetching customers modified after: ${lastModifiedDate}`);

    const allCustomers: KiotVietCustomer[] = [];
    let currentItem = 0;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      try {
        await this.checkRateLimit();
        await this.setupAuthHeaders();

        const params = {
          pageSize: pageSize.toString(),
          currentItem: currentItem.toString(),
          lastModifiedFrom: lastModifiedDate,
        };

        const response = await this.axiosInstance.get<KiotVietCustomerResponse>(
          '/customers',
          { params },
        );

        const customers = response.data.data || [];
        allCustomers.push(...customers);

        this.logger.log(
          `Fetched ${customers.length} modified customers. Total so far: ${allCustomers.length}`,
        );

        // Check if we have more pages
        currentItem += customers.length;
        hasMore = customers.length === pageSize;
      } catch (error) {
        this.logger.error(
          'Failed to fetch modified customers from KiotViet:',
          error.message,
        );
        throw new Error(
          `Failed to get modified customers from KiotViet: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `✅ Successfully fetched ${allCustomers.length} modified customers from KiotViet`,
    );
    return allCustomers;
  }

  /**
   * Test KiotViet connection
   */
  async testConnection(): Promise<any> {
    try {
      this.logger.log('🧪 Testing KiotViet connection...');

      await this.setupAuthHeaders();

      const params = {
        pageSize: '5', // Small test batch
        currentItem: '0',
      };

      const response = await this.axiosInstance.get<KiotVietCustomerResponse>(
        '/customers',
        { params },
      );

      const customers = response.data.data || [];

      this.logger.log('✅ KiotViet connection test successful!');

      return {
        success: true,
        status: response.status,
        totalCustomers: response.data.total || 0,
        sampleCustomers: customers.slice(0, 2), // Return first 2 as sample
        message: 'KiotViet connection test successful!',
        credentials: {
          retailerName: this.getCredentials().retailerName,
          hasClientId: !!this.getCredentials().clientId,
          hasClientSecret: !!this.getCredentials().clientSecret,
        },
      };
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
          checkTokenExpiry: 'Token may have expired, will auto-refresh',
        },
      };
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

  async processCustomerWebhook(
    webhookData: KiotVietWebhookPayload,
  ): Promise<KiotVietCustomer[]> {
    this.logger.log('Processing KiotViet customer webhook data');

    try {
      const customers: KiotVietCustomer[] = [];

      for (const notification of webhookData.Notifications) {
        if (notification.Action === 'customer.update') {
          // Convert webhook format to standard customer format
          for (const customerData of notification.Data) {
            const customer: KiotVietCustomer = {
              id: customerData.id,
              code: customerData.code,
              name: customerData.name,
              gender: customerData.gender,
              birthDate: customerData.birthDate,
              contactNumber: customerData.contactNumber,
              address: customerData.address,
              locationName: customerData.locationName,
              email: customerData.email,
              modifiedDate: customerData.modifiedDate,
              type: customerData.type,
              organization: customerData.organization,
              taxCode: customerData.taxCode,
              comments: customerData.comments,
            };
            customers.push(customer);
          }
        }
      }

      this.logger.log(`Processed ${customers.length} customers from webhook`);
      return customers;
    } catch (error) {
      this.logger.error('Failed to process customer webhook:', error.message);
      throw new Error(`Failed to process webhook: ${error.message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
