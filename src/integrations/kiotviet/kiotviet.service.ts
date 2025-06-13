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
    const credentials = this.getCredentials();
    const accessToken = await this.getValidAccessToken();

    this.axiosInstance.defaults.headers.common['Retailer'] =
      credentials.retailerName;
    this.axiosInstance.defaults.headers.common['Authorization'] =
      `Bearer ${accessToken}`;
  }

  private async checkRateLimit(): Promise<void> {
    const currentTime = Date.now();
    const hourElapsed = currentTime - this.hourStartTime;

    if (hourElapsed >= 3600000) {
      this.requestCount = 0;
      this.hourStartTime = currentTime;
      this.logger.log('Rate limit counter reset');
    }

    if (this.requestCount >= this.maxRequestsPerHour) {
      const waitTime = 3600000 - hourElapsed;
      this.logger.warn(
        `Rate limit reached. Waiting ${waitTime}ms before next request.`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.requestCount++;
  }

  /**
   * Get all customers from KiotViet with pagination
   */
  async getAllCustomers(): Promise<KiotVietCustomer[]> {
    try {
      this.logger.log('Starting to fetch all customers from KiotViet');

      await this.setupAuthHeaders();

      const allCustomers: KiotVietCustomer[] = [];
      let currentItem = 0;
      const pageSize = 100; // Max allowed by KiotViet
      let hasMoreData = true;

      while (hasMoreData) {
        await this.checkRateLimit();

        this.logger.log(
          `Fetching customers page: currentItem=${currentItem}, pageSize=${pageSize}`,
        );

        const params = {
          pageSize: pageSize.toString(),
          currentItem: currentItem.toString(),
          orderBy: 'modifiedDate',
          orderDirection: 'ASC',
        };

        const response = await this.axiosInstance.get<KiotVietCustomerResponse>(
          '/customers',
          { params },
        );
        const { data, total } = response.data;

        this.logger.log(`Fetched ${data.length} customers. Total: ${total}`);

        allCustomers.push(...data);
        currentItem += data.length;

        // Check if we have more data
        hasMoreData = currentItem < total && data.length === pageSize;

        // Add small delay to avoid rate limiting
        if (hasMoreData) {
          await this.delay(200);
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
      throw new BadRequestException(
        `Failed to fetch customers from KiotViet: ${error.message}`,
      );
    }
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
    try {
      await this.setupAuthHeaders();

      this.logger.log(`Fetching customers modified after: ${lastModifiedDate}`);

      const allCustomers: KiotVietCustomer[] = [];
      let currentItem = 0;
      const pageSize = 100;
      let hasMoreData = true;

      while (hasMoreData) {
        await this.checkRateLimit();

        const params = {
          pageSize: pageSize.toString(),
          currentItem: currentItem.toString(),
          lastModifiedFrom: lastModifiedDate,
          orderBy: 'modifiedDate',
          orderDirection: 'ASC',
        };

        const response = await this.axiosInstance.get<KiotVietCustomerResponse>(
          '/customers',
          { params },
        );
        const { data, total } = response.data;

        allCustomers.push(...data);
        currentItem += data.length;

        hasMoreData = currentItem < total && data.length === pageSize;

        if (hasMoreData) {
          await this.delay(200);
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
      throw new BadRequestException(
        `Failed to fetch modified customers: ${error.message}`,
      );
    }
  }

  /**
   * Test KiotViet connection
   */
  async testConnection(): Promise<any> {
    try {
      await this.setupAuthHeaders();
      await this.checkRateLimit();

      this.logger.log('Testing KiotViet connection...');

      const params = {
        pageSize: '5',
        currentItem: '0',
      };

      const response = await this.axiosInstance.get<KiotVietCustomerResponse>(
        '/customers',
        { params },
      );

      this.logger.log('✅ KiotViet connection test successful!');

      return {
        success: true,
        status: response.status,
        totalCustomers: response.data.total || 0,
        sampleCustomers: response.data.data?.slice(0, 2) || [],
        message: 'KiotViet connection test successful!',
      };
    } catch (error) {
      this.logger.error('❌ KiotViet connection test failed:', error.message);

      return {
        success: false,
        error: error.message,
        status: error.response?.status || 0,
        message: 'KiotViet connection test failed!',
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
