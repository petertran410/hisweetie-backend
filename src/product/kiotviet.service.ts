import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

// Interface for KiotViet OAuth token response
interface KiotVietTokenResponse {
  access_token: string;
  expires_in: number; // Token lifetime in seconds (typically 86400 = 24 hours)
  token_type: string; // Typically "Bearer"
}

// Interface for stored token information with expiration tracking
interface StoredToken {
  accessToken: string;
  expiresAt: Date; // When this token expires
  tokenType: string;
}

// Interface for KiotViet API response structure
interface KiotVietProduct {
  id: number;
  code: string;
  name: string;
  categoryId?: number;
  categoryName?: string;
  fullName?: string;
  basePrice?: number;
  description?: string;
  images?: Array<{ Image: string }>;
  unit?: string;
  modifiedDate?: string;
  createdDate?: string;
  allowsSale?: boolean;
  hasVariants?: boolean;
  weight?: number;
  isActive?: boolean;
}

interface KiotVietApiResponse {
  total: number;
  pageSize: number;
  data: KiotVietProduct[];
  removeId?: number[]; // IDs of deleted products
}

interface KiotVietCredentials {
  retailerName: string;
  clientId: string;
  clientSecret: string;
}

@Injectable()
export class KiotVietService {
  private readonly logger = new Logger(KiotVietService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://public.kiotapi.com';
  private readonly authUrl = 'https://id.kiotviet.vn/connect/token';

  // Token management - stores current valid token
  private currentToken: StoredToken | null = null;

  // Rate limiting tracking (KiotViet allows 5000 requests/hour)
  private requestCount = 0;
  private hourStartTime = Date.now();
  private readonly maxRequestsPerHour = 4900; // Leave some buffer

  constructor(private readonly configService: ConfigService) {
    // Initialize axios instance with default configuration
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for logging and error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.logger.debug(`API call successful: ${response.config.url}`);
        return response;
      },
      (error) => {
        this.logger.error(`API call failed: ${error.message}`);
        return Promise.reject(error);
      },
    );
  }

  /**
   * Get KiotViet credentials from environment configuration
   * Uses client credentials instead of pre-obtained access token
   */
  getCredentials(): KiotVietCredentials {
    const retailerName = this.configService.get<string>(
      'KIOTVIET_RETAILER_NAME',
    );
    const clientId = this.configService.get<string>('KIOTVIET_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'KIOTVIET_CLIENT_SECRET',
    );

    if (!retailerName || !clientId || !clientSecret) {
      throw new BadRequestException(
        'KiotViet credentials not configured. Please set KIOTVIET_RETAILER_NAME, KIOTVIET_CLIENT_ID, and KIOTVIET_CLIENT_SECRET environment variables.',
      );
    }

    return {
      retailerName,
      clientId,
      clientSecret,
    };
  }

  /**
   * Obtain access token from KiotViet using OAuth 2.0 client credentials flow
   * This implements the API call described in section 2.2 of the KiotViet documentation
   */
  private async obtainAccessToken(
    credentials: KiotVietCredentials,
  ): Promise<StoredToken> {
    this.logger.log('Obtaining new access token from KiotViet');

    try {
      // Prepare the request body as form data (application/x-www-form-urlencoded)
      // This follows the exact format specified in KiotViet documentation
      const requestBody = new URLSearchParams();
      requestBody.append('scopes', 'PublicApi.Access');
      requestBody.append('grant_type', 'client_credentials');
      requestBody.append('client_id', credentials.clientId);
      requestBody.append('client_secret', credentials.clientSecret);

      // Make the token request to KiotViet's OAuth endpoint
      const response: AxiosResponse<KiotVietTokenResponse> = await axios.post(
        this.authUrl,
        requestBody.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000, // 10 second timeout for auth requests
        },
      );

      const tokenData = response.data;

      // Calculate when this token will expire
      // We subtract 5 minutes (300 seconds) as a safety buffer to ensure we refresh before actual expiration
      const expiresAt = new Date(
        Date.now() + (tokenData.expires_in - 300) * 1000,
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

      // Provide more specific error messages based on the response
      if (error.response?.status === 400) {
        throw new BadRequestException(
          'Invalid KiotViet client credentials. Please check your KIOTVIET_CLIENT_ID and KIOTVIET_CLIENT_SECRET.',
        );
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
        `Rate limit approached. Waiting ${Math.ceil(waitTime / 1000)} seconds`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.hourStartTime = Date.now();
    }
  }

  private async fetchProductBatch(
    currentItem: number = 0,
    pageSize: number = 100,
    lastModifiedFrom?: string,
  ): Promise<KiotVietApiResponse> {
    await this.checkRateLimit();

    await this.setupAuthHeaders();

    const params: any = {
      currentItem,
      pageSize,
      includeRemoveIds: true,
      orderBy: 'id',
      orderDirection: 'Asc',
    };

    if (lastModifiedFrom) {
      params.lastModifiedFrom = lastModifiedFrom;
    }

    try {
      const response: AxiosResponse<KiotVietApiResponse> =
        await this.axiosInstance.get('/products', {
          params,
        });

      this.requestCount++;
      this.logger.debug(
        `Fetched batch: currentItem=${currentItem}, returned ${response.data.data.length} products`,
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 401 && this.currentToken) {
        this.logger.warn(
          'Received 401 error, clearing cached token and retrying once',
        );
        this.currentToken = null;

        await this.setupAuthHeaders();
        const retryResponse: AxiosResponse<KiotVietApiResponse> =
          await this.axiosInstance.get('/products', {
            params,
          });

        this.requestCount++;
        return retryResponse.data;
      }

      this.logger.error(
        `Failed to fetch product batch at currentItem ${currentItem}:`,
        error.message,
      );
      throw new BadRequestException(
        `Failed to fetch products from KiotViet: ${error.message}`,
      );
    }
  }

  async testConnection(): Promise<{
    success: boolean;
    message: string;
    tokenInfo?: {
      expiresAt: string;
      tokenType: string;
    };
  }> {
    try {
      this.logger.log('Testing KiotViet connection and authentication');

      const credentials = this.getCredentials();

      const token = await this.getValidAccessToken();

      await this.setupAuthHeaders();
      const testResponse = await this.axiosInstance.get('/products', {
        params: { currentItem: 0, pageSize: 1 },
      });

      this.requestCount++;

      return {
        success: true,
        message: `Successfully connected to KiotViet for retailer: ${credentials.retailerName}. Found ${testResponse.data.total} total products.`,
        tokenInfo: this.currentToken
          ? {
              expiresAt: this.currentToken.expiresAt.toISOString(),
              tokenType: this.currentToken.tokenType,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error('KiotViet connection test failed:', error.message);

      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
      };
    }
  }

  async fetchAllProducts(lastModifiedFrom?: string): Promise<{
    products: KiotVietProduct[];
    deletedIds: number[];
    totalFetched: number;
    batchInfo: Array<{
      batchNumber: number;
      itemsFetched: number;
      currentItem: number;
    }>;
  }> {
    this.logger.log('Starting complete product synchronization from KiotViet');

    const allProducts: KiotVietProduct[] = [];
    const allDeletedIds: number[] = [];
    const batchInfo: Array<{
      batchNumber: number;
      itemsFetched: number;
      currentItem: number;
    }> = [];

    let currentItem = 0;
    const batchSize = 100;
    let totalProducts = 0;
    let batchNumber = 1;

    try {
      this.logger.log(
        'Fetching initial batch to determine total product count',
      );
      const firstBatch = await this.fetchProductBatch(
        currentItem,
        batchSize,
        lastModifiedFrom,
      );

      totalProducts = firstBatch.total;
      this.logger.log(`Total products in KiotViet: ${totalProducts}`);

      if (totalProducts === 0) {
        this.logger.log('No products found in KiotViet');
        return {
          products: [],
          deletedIds: [],
          totalFetched: 0,
          batchInfo: [],
        };
      }

      allProducts.push(...firstBatch.data);
      if (firstBatch.removeId) {
        allDeletedIds.push(...firstBatch.removeId);
      }

      batchInfo.push({
        batchNumber: batchNumber,
        itemsFetched: firstBatch.data.length,
        currentItem: currentItem,
      });

      this.logger.log(
        `Batch ${batchNumber}: Fetched ${firstBatch.data.length} products`,
      );

      const totalBatches = Math.ceil(totalProducts / batchSize);
      currentItem = batchSize;
      batchNumber++;

      while (currentItem < totalProducts) {
        this.logger.log(
          `Processing batch ${batchNumber}/${totalBatches} (items ${currentItem}-${Math.min(currentItem + batchSize - 1, totalProducts - 1)})`,
        );

        const batch = await this.fetchProductBatch(
          currentItem,
          batchSize,
          lastModifiedFrom,
        );

        allProducts.push(...batch.data);
        if (batch.removeId) {
          allDeletedIds.push(...batch.removeId);
        }

        batchInfo.push({
          batchNumber: batchNumber,
          itemsFetched: batch.data.length,
          currentItem: currentItem,
        });

        this.logger.log(
          `Batch ${batchNumber}: Fetched ${batch.data.length} products`,
        );

        currentItem += batchSize;
        batchNumber++;

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      this.logger.log(
        `Successfully fetched all products. Total: ${allProducts.length}, Deleted: ${allDeletedIds.length}`,
      );

      return {
        products: allProducts,
        deletedIds: allDeletedIds,
        totalFetched: allProducts.length,
        batchInfo,
      };
    } catch (error) {
      this.logger.error('Failed to fetch all products:', error.message);
      throw error;
    }
  }

  validateDataIntegrity(
    products: KiotVietProduct[],
    expectedTotal: number,
    batchInfo: Array<{
      batchNumber: number;
      itemsFetched: number;
      currentItem: number;
    }>,
  ): {
    isValid: boolean;
    issues: string[];
    summary: {
      expectedTotal: number;
      actualTotal: number;
      totalBatches: number;
      duplicateIds: number[];
    };
  } {
    const issues: string[] = [];
    const productIds = products.map((p) => p.id);
    const uniqueIds = new Set(productIds);
    const duplicateIds = productIds.filter(
      (id, index) => productIds.indexOf(id) !== index,
    );

    if (duplicateIds.length > 0) {
      issues.push(
        `Found ${duplicateIds.length} duplicate product IDs: ${duplicateIds.slice(0, 5).join(', ')}${duplicateIds.length > 5 ? '...' : ''}`,
      );
    }

    if (products.length !== expectedTotal) {
      issues.push(
        `Product count mismatch: expected ${expectedTotal}, got ${products.length}`,
      );
    }

    const sortedIds = [...uniqueIds].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 0; i < sortedIds.length - 1; i++) {
      const currentId = sortedIds[i];
      const nextId = sortedIds[i + 1];
      if (nextId - currentId > 1) {
        for (let missingId = currentId + 1; missingId < nextId; missingId++) {
          gaps.push(missingId);
        }
      }
    }

    if (gaps.length > 0) {
      this.logger.log(
        `Found ${gaps.length} gaps in product ID sequence (likely deleted products)`,
      );
    }

    const isValid = issues.length === 0;

    return {
      isValid,
      issues,
      summary: {
        expectedTotal,
        actualTotal: products.length,
        totalBatches: batchInfo.length,
        duplicateIds: [...new Set(duplicateIds)],
      },
    };
  }
}
