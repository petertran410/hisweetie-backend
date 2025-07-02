// src/product/kiotviet.service.ts - STREAMLINED FOR MINIMAL SYNC
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

// ================================
// INTERFACES
// ================================

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

interface KiotVietProduct {
  id: number;
  code: string;
  name: string;
  categoryId?: number;
  categoryName?: string;
  tradeMarkId?: number;
  tradeMarkName?: string;
  basePrice?: number;
  images?: Array<{ Image: string }> | string[];
  type?: number; // 1=combo, 2=normal, 3=service
  modifiedDate?: string;
  createdDate?: string;
  allowsSale?: boolean;
}

interface KiotVietCategory {
  categoryId: number;
  categoryName: string;
  parentId?: number;
  hasChild?: boolean;
  rank?: number;
  retailerId?: number;
  createdDate?: string;
  modifiedDate?: string;
}

interface KiotVietTrademark {
  tradeMarkId: number;
  tradeMarkName: string;
  createdDate?: string;
  modifiedDate?: string;
}

interface SyncResult {
  success: boolean;
  totalSynced: number;
  totalUpdated: number;
  totalDeleted: number;
  errors: string[];
  summary: {
    beforeSync: number;
    afterSync: number;
    newRecords: number;
    updatedRecords: number;
    skippedRecords: number;
  };
}

@Injectable()
export class KiotVietService {
  private readonly logger = new Logger(KiotVietService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://public.kiotapi.com';
  private readonly authUrl = 'https://id.kiotviet.vn/connect/token';
  private readonly prisma = new PrismaClient();

  private currentToken: StoredToken | null = null;
  private requestCount = 0;
  private hourStartTime = Date.now();
  private readonly maxRequestsPerHour = 4900;

  constructor(private readonly configService: ConfigService) {
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

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

  // ================================
  // AUTHENTICATION
  // ================================

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
        'KiotViet credentials not configured. Please set KIOTVIET_RETAILER_NAME, KIOTVIET_CLIENT_ID, and KIOTVIET_CLIENT_SECRET environment variables.',
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
        `Rate limit approached. Waiting ${Math.round(waitTime / 1000)} seconds.`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.hourStartTime = Date.now();
    }
  }

  // ================================
  // FETCH METHODS
  // ================================

  async fetchAllTrademarks(): Promise<KiotVietTrademark[]> {
    this.logger.log('Fetching all trademarks from KiotViet');

    await this.checkRateLimit();
    await this.setupAuthHeaders();

    try {
      // FIXED: Use simpler parameters based on KiotViet API documentation
      const response = await this.axiosInstance.get('/trademark', {
        params: {
          pageSize: 100,
          currentItem: 0,
          // FIXED: Remove orderBy and orderDirection that might be causing 500 error
          // orderBy: 'tradeMarkName',
          // orderDirection: 'Asc',
        },
      });

      this.requestCount++;
      this.logger.log(
        `Successfully fetched ${response.data.data.length} trademarks from KiotViet`,
      );
      return response.data.data;
    } catch (error) {
      // FIXED: Better error logging with response details
      if (error.response) {
        this.logger.error('KiotViet API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers,
        });
      } else if (error.request) {
        this.logger.error('KiotViet API Request Error:', error.request);
      } else {
        this.logger.error('KiotViet API Error:', error.message);
      }

      this.logger.error('Failed to fetch trademarks:', error.message);
      throw new BadRequestException(
        `Failed to fetch trademarks from KiotViet: ${error.message}`,
      );
    }
  }

  async fetchAllCategories(): Promise<KiotVietCategory[]> {
    this.logger.log('Fetching all categories from KiotViet');

    await this.checkRateLimit();
    await this.setupAuthHeaders();

    try {
      // FIXED: Correct parameter name - should be "hierarchicalData" not "hierachicalData"
      const response = await this.axiosInstance.get('/categories', {
        params: {
          pageSize: 100,
          currentItem: 0,
          hierarchicalData: true, // FIXED: Correct spelling
        },
      });

      this.requestCount++;
      this.logger.log(
        `Successfully fetched ${response.data.data.length} categories from KiotViet`,
      );
      return response.data.data;
    } catch (error) {
      // FIXED: Better error logging with response details
      if (error.response) {
        this.logger.error('KiotViet API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers,
        });
      } else if (error.request) {
        this.logger.error('KiotViet API Request Error:', error.request);
      } else {
        this.logger.error('KiotViet API Error:', error.message);
      }

      this.logger.error('Failed to fetch categories:', error.message);
      throw new BadRequestException(
        `Failed to fetch categories from KiotViet: ${error.message}`,
      );
    }
  }

  async fetchAllProducts(lastModifiedFrom?: string): Promise<{
    products: KiotVietProduct[];
    totalFetched: number;
  }> {
    this.logger.log('Starting to fetch all products from KiotViet');

    const allProducts: KiotVietProduct[] = [];
    let currentItem = 0;
    const pageSize = 100;
    let hasMoreData = true;
    let batchNumber = 1;

    try {
      while (hasMoreData) {
        this.logger.log(
          `Fetching batch ${batchNumber}, starting from item ${currentItem}`,
        );

        const batchResult = await this.fetchProductBatch(
          currentItem,
          pageSize,
          lastModifiedFrom,
        );

        if (batchResult.data && batchResult.data.length > 0) {
          allProducts.push(...batchResult.data);
          currentItem += batchResult.data.length;

          this.logger.log(
            `Batch ${batchNumber} completed: fetched ${batchResult.data.length} products. Total so far: ${allProducts.length}`,
          );

          // Check if we have more data
          hasMoreData =
            batchResult.data.length === pageSize &&
            allProducts.length < batchResult.total;
          batchNumber++;
        } else {
          hasMoreData = false;
        }

        // Safety check to avoid infinite loops
        if (batchNumber > 500) {
          // Maximum 50,000 products
          this.logger.warn('Reached maximum batch limit (500), stopping fetch');
          break;
        }
      }

      this.logger.log(
        `Completed fetching all products: total ${allProducts.length} products`,
      );
      return { products: allProducts, totalFetched: allProducts.length };
    } catch (error) {
      this.logger.error('Failed to fetch all products:', error.message);
      throw new BadRequestException(
        `Failed to fetch products from KiotViet: ${error.message}`,
      );
    }
  }

  private async fetchProductBatch(
    currentItem: number,
    pageSize: number,
    lastModifiedFrom?: string,
  ): Promise<{ total: number; data: KiotVietProduct[] }> {
    await this.checkRateLimit();
    await this.setupAuthHeaders();

    const params: any = {
      currentItem,
      pageSize,
      includeInventory: false, // We don't need inventory for basic sync
      // FIXED: Remove orderBy/orderDirection that might cause issues
      // orderBy: 'id',
      // orderDirection: 'Asc',
    };

    if (lastModifiedFrom) {
      params.lastModifiedFrom = lastModifiedFrom;
    }

    try {
      const response = await this.axiosInstance.get('/products', { params });
      this.requestCount++;

      this.logger.debug(
        `Fetched batch: currentItem=${currentItem}, returned ${response.data.data.length} products`,
      );
      return response.data;
    } catch (error) {
      // FIXED: Better error handling with response details
      if (error.response) {
        this.logger.error('KiotViet Products API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          params: params,
        });
      }

      if (error.response?.status === 401 && this.currentToken) {
        this.logger.warn(
          'Received 401 error, clearing cached token and retrying once',
        );
        this.currentToken = null;
        await this.setupAuthHeaders();
        const retryResponse = await this.axiosInstance.get('/products', {
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

  // ================================
  // SYNC METHODS
  // ================================

  async syncTrademarks(): Promise<SyncResult> {
    this.logger.log('Starting trademark synchronization');

    const errors: string[] = [];
    let totalSynced = 0;
    let totalUpdated = 0;

    try {
      const beforeSync = await this.prisma.kiotviet_trademark.count();
      const trademarks = await this.fetchAllTrademarks();

      const results = await this.prisma.$transaction(async (prisma) => {
        let newRecords = 0;
        let updatedRecords = 0;

        for (const trademark of trademarks) {
          try {
            const existingTrademark =
              await prisma.kiotviet_trademark.findUnique({
                where: { kiotviet_id: trademark.tradeMarkId },
              });

            if (existingTrademark) {
              // Update existing
              await prisma.kiotviet_trademark.update({
                where: { kiotviet_id: trademark.tradeMarkId },
                data: {
                  name: trademark.tradeMarkName,
                  created_date: trademark.createdDate
                    ? new Date(trademark.createdDate)
                    : null,
                  modified_date: trademark.modifiedDate
                    ? new Date(trademark.modifiedDate)
                    : null,
                  synced_at: new Date(),
                },
              });
              updatedRecords++;
            } else {
              // Create new
              await prisma.kiotviet_trademark.create({
                data: {
                  kiotviet_id: trademark.tradeMarkId,
                  name: trademark.tradeMarkName,
                  created_date: trademark.createdDate
                    ? new Date(trademark.createdDate)
                    : null,
                  modified_date: trademark.modifiedDate
                    ? new Date(trademark.modifiedDate)
                    : null,
                  synced_at: new Date(),
                },
              });
              newRecords++;
            }
          } catch (error) {
            errors.push(
              `Failed to sync trademark ${trademark.tradeMarkId}: ${error.message}`,
            );
          }
        }

        return { newRecords, updatedRecords };
      });

      const afterSync = await this.prisma.kiotviet_trademark.count();

      this.logger.log(
        `Trademark sync completed: ${results.newRecords} new, ${results.updatedRecords} updated`,
      );

      return {
        success: errors.length === 0,
        totalSynced: results.newRecords,
        totalUpdated: results.updatedRecords,
        totalDeleted: 0,
        errors,
        summary: {
          beforeSync,
          afterSync,
          newRecords: results.newRecords,
          updatedRecords: results.updatedRecords,
          skippedRecords: 0,
        },
      };
    } catch (error) {
      this.logger.error('Trademark sync failed:', error.message);
      throw new BadRequestException(`Trademark sync failed: ${error.message}`);
    }
  }

  async syncCategories(): Promise<SyncResult> {
    this.logger.log('Starting category synchronization');

    const errors: string[] = [];

    try {
      const beforeSync = await this.prisma.kiotviet_category.count();
      const categories = await this.fetchAllCategories();

      const results = await this.prisma.$transaction(async (prisma) => {
        let newRecords = 0;
        let updatedRecords = 0;

        for (const category of categories) {
          try {
            const existingCategory = await prisma.kiotviet_category.findUnique({
              where: { kiotviet_id: category.categoryId },
            });

            if (existingCategory) {
              // Update existing
              await prisma.kiotviet_category.update({
                where: { kiotviet_id: category.categoryId },
                data: {
                  name: category.categoryName,
                  parent_id: category.parentId,
                  has_child: category.hasChild || false,
                  rank: category.rank,
                  retailer_id: category.retailerId,
                  created_date: category.createdDate
                    ? new Date(category.createdDate)
                    : null,
                  modified_date: category.modifiedDate
                    ? new Date(category.modifiedDate)
                    : null,
                  synced_at: new Date(),
                },
              });
              updatedRecords++;
            } else {
              // Create new
              await prisma.kiotviet_category.create({
                data: {
                  kiotviet_id: category.categoryId,
                  name: category.categoryName,
                  parent_id: category.parentId,
                  has_child: category.hasChild || false,
                  rank: category.rank,
                  retailer_id: category.retailerId,
                  created_date: category.createdDate
                    ? new Date(category.createdDate)
                    : null,
                  modified_date: category.modifiedDate
                    ? new Date(category.modifiedDate)
                    : null,
                  synced_at: new Date(),
                },
              });
              newRecords++;
            }
          } catch (error) {
            errors.push(
              `Failed to sync category ${category.categoryId}: ${error.message}`,
            );
          }
        }

        return { newRecords, updatedRecords };
      });

      const afterSync = await this.prisma.kiotviet_category.count();

      this.logger.log(
        `Category sync completed: ${results.newRecords} new, ${results.updatedRecords} updated`,
      );

      return {
        success: errors.length === 0,
        totalSynced: results.newRecords,
        totalUpdated: results.updatedRecords,
        totalDeleted: 0,
        errors,
        summary: {
          beforeSync,
          afterSync,
          newRecords: results.newRecords,
          updatedRecords: results.updatedRecords,
          skippedRecords: 0,
        },
      };
    } catch (error) {
      this.logger.error('Category sync failed:', error.message);
      throw new BadRequestException(`Category sync failed: ${error.message}`);
    }
  }

  async syncProducts(lastModifiedFrom?: string): Promise<SyncResult> {
    this.logger.log('Starting product synchronization - MINIMAL FIELDS ONLY');
    this.logger.log(
      'Syncing: kiotviet_id, code, name, image, price, type, category',
    );

    const errors: string[] = [];

    try {
      const beforeSync = await this.prisma.product.count({
        where: { is_from_kiotviet: true },
      });
      const { products } = await this.fetchAllProducts(lastModifiedFrom);

      this.logger.log(`Fetched ${products.length} products from KiotViet`);

      const results = await this.prisma.$transaction(
        async (prisma) => {
          let newRecords = 0;
          let updatedRecords = 0;
          let skippedRecords = 0;

          for (const kiotProduct of products) {
            try {
              // Process images - extract URLs from KiotViet format
              let processedImages: any[] = [];
              if (kiotProduct.images && Array.isArray(kiotProduct.images)) {
                const imageUrls = kiotProduct.images
                  .map((img) => (typeof img === 'string' ? img : img.Image))
                  .filter((url) => url && url.trim() !== '');

                if (imageUrls.length > 0) {
                  processedImages = imageUrls;
                }
              }

              // Check if product exists
              const existingProduct = await prisma.product.findUnique({
                where: { kiotviet_id: BigInt(kiotProduct.id) },
              });

              const productData = {
                kiotviet_id: BigInt(kiotProduct.id),
                kiotviet_code: kiotProduct.code,
                kiotviet_name: kiotProduct.name,
                kiotviet_images: processedImages,
                kiotviet_price: kiotProduct.basePrice
                  ? Number(kiotProduct.basePrice)
                  : null,
                kiotviet_type: kiotProduct.type,
                kiotviet_category_id: kiotProduct.categoryId,
                kiotviet_trademark_id: kiotProduct.tradeMarkId,
                is_from_kiotviet: true,
                kiotviet_synced_at: new Date(),

                // Also populate basic fields for consistency
                title: kiotProduct.name,
                is_visible: kiotProduct.allowsSale !== false,
              };

              if (existingProduct) {
                // Update existing product
                await prisma.product.update({
                  where: { kiotviet_id: BigInt(kiotProduct.id) },
                  data: productData,
                });
                updatedRecords++;
                this.logger.debug(
                  `Updated product: ${kiotProduct.name} (ID: ${kiotProduct.id})`,
                );
              } else {
                // Create new product
                await prisma.product.create({
                  data: productData,
                });
                newRecords++;
                this.logger.debug(
                  `Created product: ${kiotProduct.name} (ID: ${kiotProduct.id})`,
                );
              }
            } catch (error) {
              errors.push(
                `Failed to sync product ${kiotProduct.id} (${kiotProduct.name}): ${error.message}`,
              );
              skippedRecords++;
              this.logger.error(
                `Error syncing product ${kiotProduct.id}:`,
                error.message,
              );
            }
          }

          return { newRecords, updatedRecords, skippedRecords };
        },
        {
          timeout: 300000, // 5 minutes timeout for large datasets
        },
      );

      const afterSync = await this.prisma.product.count({
        where: { is_from_kiotviet: true },
      });

      this.logger.log(
        `Product sync completed: ${results.newRecords} new, ${results.updatedRecords} updated, ${results.skippedRecords} skipped`,
      );

      return {
        success: errors.length === 0,
        totalSynced: results.newRecords,
        totalUpdated: results.updatedRecords,
        totalDeleted: 0,
        errors,
        summary: {
          beforeSync,
          afterSync,
          newRecords: results.newRecords,
          updatedRecords: results.updatedRecords,
          skippedRecords: results.skippedRecords,
        },
      };
    } catch (error) {
      this.logger.error('Product sync failed:', error.message);
      throw new BadRequestException(`Product sync failed: ${error.message}`);
    }
  }

  // ================================
  // FULL SYNC
  // ================================

  async fullSync(): Promise<{
    success: boolean;
    trademarks: SyncResult;
    categories: SyncResult;
    products: SyncResult;
    errors: string[];
  }> {
    this.logger.log('Starting FULL SYNC of all KiotViet data');

    const errors: string[] = [];

    try {
      // Step 1: Sync trademarks
      this.logger.log('Step 1: Syncing trademarks...');
      const trademarksResult = await this.syncTrademarks();
      if (!trademarksResult.success) {
        errors.push(...trademarksResult.errors);
      }

      // Step 2: Sync categories
      this.logger.log('Step 2: Syncing categories...');
      const categoriesResult = await this.syncCategories();
      if (!categoriesResult.success) {
        errors.push(...categoriesResult.errors);
      }

      // Step 3: Sync products
      this.logger.log('Step 3: Syncing products...');
      const productsResult = await this.syncProducts();
      if (!productsResult.success) {
        errors.push(...productsResult.errors);
      }

      const overallSuccess = errors.length === 0;

      this.logger.log(
        `Full sync completed. Overall success: ${overallSuccess}`,
      );
      if (errors.length > 0) {
        this.logger.warn(`Full sync completed with ${errors.length} errors`);
      }

      return {
        success: overallSuccess,
        trademarks: trademarksResult,
        categories: categoriesResult,
        products: productsResult,
        errors,
      };
    } catch (error) {
      this.logger.error('Full sync failed:', error.message);
      throw new BadRequestException(`Full sync failed: ${error.message}`);
    }
  }

  // ================================
  // UTILITY METHODS
  // ================================

  async testConnection(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      this.logger.log('Testing KiotViet API connection');

      // First test if we can get authentication token
      await this.setupAuthHeaders();

      // Then test a simple API call (categories is usually the lightest)
      const response = await this.axiosInstance.get('/categories', {
        params: {
          pageSize: 1,
          currentItem: 0,
        },
      });

      this.requestCount++;

      return {
        success: true,
        message: 'KiotViet API connection successful',
        details: {
          endpoint: '/categories',
          responseStatus: response.status,
          dataCount: response.data?.data?.length || 0,
        },
      };
    } catch (error) {
      this.logger.error('KiotViet connection test failed:', error.message);

      let errorMessage = 'Connection test failed';
      let details: any = {};

      if (error.response) {
        errorMessage = `API returned ${error.response.status}: ${error.response.statusText}`;
        details = {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        };
      } else if (error.request) {
        errorMessage = 'No response received from KiotViet API';
        details = { request: 'Timeout or network error' };
      } else {
        errorMessage = error.message;
      }

      return {
        success: false,
        message: errorMessage,
        details,
      };
    }
  }
}
