// src/product/kiotviet.service.ts - STREAMLINED FOR MINIMAL SYNC
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

import {
  SyncResult,
  FullSyncResult,
  ValidationResult,
  SyncOrderStep,
  ProductFetchResult,
  KiotVietProduct,
  KiotVietCategory,
  KiotVietTrademark,
  KiotVietCredentials,
  KiotVietTokenResponse,
  StoredToken,
} from './types/sync.types';

interface KiotVietCategoryApiResponse {
  total: number;
  pageSize: number;
  data: KiotVietCategory[];
  timestamp?: string;
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
    this.logger.log('Starting to fetch all categories from KiotViet');

    const allCategories: KiotVietCategory[] = [];
    const processedCategoryIds = new Set<number>();
    let currentItem = 0;
    let hasMoreData = true;
    let batchNumber = 1;
    let totalCategories = 0;
    let consecutiveEmptyPages = 0;
    let consecutiveErrorPages = 0;

    // Constants cho retry mechanism
    const PAGE_SIZE = 50; // Giảm xuống từ 100 để tránh timeout
    const MAX_CONSECUTIVE_EMPTY_PAGES = 3;
    const MAX_CONSECUTIVE_ERROR_PAGES = 5;
    const RETRY_DELAY_MS = 2000;
    const MAX_RETRIES = 3;

    await this.checkRateLimit();
    await this.setupAuthHeaders();

    try {
      while (hasMoreData && batchNumber <= 50) {
        // Tăng limit từ 20 lên 50
        this.logger.log(
          `📄 Fetching batch ${batchNumber} (currentItem: ${currentItem})`,
        );

        try {
          // Retry mechanism cho từng request
          let response: AxiosResponse<KiotVietCategoryApiResponse> | null =
            null;
          let retryCount = 0;

          while (retryCount < MAX_RETRIES && !response) {
            try {
              // Type assertion để tránh lỗi TypeScript
              response =
                await this.axiosInstance.get<KiotVietCategoryApiResponse>(
                  '/categories',
                  {
                    params: {
                      pageSize: PAGE_SIZE,
                      currentItem,
                      hierarchicalData: true, // Sử dụng hierarchical data như source mẫu
                      orderBy: 'createdDate',
                      orderDirection: 'ASC',
                    },
                  },
                );
              this.requestCount++;
            } catch (error) {
              retryCount++;
              this.logger.warn(
                `⚠️ Request failed (attempt ${retryCount}/${MAX_RETRIES}): ${error.message}`,
              );

              if (retryCount < MAX_RETRIES) {
                await new Promise((resolve) =>
                  setTimeout(resolve, RETRY_DELAY_MS * retryCount),
                );
              } else {
                throw error;
              }
            }
          }

          if (!response || !response.data) {
            this.logger.warn('⚠️ Received null response from KiotViet API');
            consecutiveEmptyPages++;

            if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
              this.logger.log(
                `🔚 API returned null ${consecutiveEmptyPages} times - ending pagination`,
              );
              break;
            }

            currentItem += PAGE_SIZE;
            continue;
          }

          consecutiveEmptyPages = 0;
          consecutiveErrorPages = 0;

          // Safe destructuring với type checking
          const responseData = response.data;
          const total = responseData.total;
          const categories = responseData.data || [];

          // Cập nhật total categories
          if (total !== undefined && total !== null) {
            if (totalCategories === 0) {
              totalCategories = total;
              this.logger.log(
                `📊 Total categories detected: ${totalCategories}`,
              );
            } else if (total !== totalCategories) {
              this.logger.warn(
                `⚠️ Total count updated: ${totalCategories} → ${total}`,
              );
              totalCategories = total;
            }
          }

          if (!categories || categories.length === 0) {
            this.logger.warn(
              `⚠️ Empty page received at position ${currentItem}`,
            );
            consecutiveEmptyPages++;

            if (
              totalCategories > 0 &&
              allCategories.length >= totalCategories
            ) {
              this.logger.log(
                '✅ All expected categories processed - pagination complete',
              );
              break;
            }

            if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
              this.logger.log(
                `🔚 Stopping after ${consecutiveEmptyPages} consecutive empty pages`,
              );
              break;
            }

            currentItem += PAGE_SIZE;
            continue;
          }

          // Filter duplicate categories
          const newCategories = categories.filter((category) => {
            if (!category.categoryId || !category.categoryName) {
              this.logger.warn(
                `⚠️ Skipping invalid category: id=${category.categoryId}, name='${category.categoryName}'`,
              );
              return false;
            }

            if (processedCategoryIds.has(category.categoryId)) {
              this.logger.debug(
                `⚠️ Duplicate category ID detected: ${category.categoryId} (${category.categoryName})`,
              );
              return false;
            }

            processedCategoryIds.add(category.categoryId);
            return true;
          });

          if (newCategories.length > 0) {
            allCategories.push(...newCategories);

            this.logger.log(
              `✅ Batch ${batchNumber} completed: fetched ${newCategories.length} new categories. ` +
                `Total so far: ${allCategories.length}${totalCategories > 0 ? `/${totalCategories}` : ''}`,
            );
          }

          // Update currentItem for next iteration
          currentItem += PAGE_SIZE;

          // Check if we have more data
          hasMoreData =
            newCategories.length === PAGE_SIZE &&
            (totalCategories === 0 || allCategories.length < totalCategories);

          batchNumber++;

          // Rate limiting delay
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          consecutiveErrorPages++;
          this.logger.error(
            `❌ Error fetching batch ${batchNumber}: ${error.message}`,
          );

          if (consecutiveErrorPages >= MAX_CONSECUTIVE_ERROR_PAGES) {
            this.logger.error(
              `💥 Too many consecutive errors (${consecutiveErrorPages}). Stopping sync.`,
            );
            throw error;
          }

          // Exponential backoff for errors
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_DELAY_MS * consecutiveErrorPages),
          );

          currentItem += PAGE_SIZE;
        }
      }

      const completionRate =
        totalCategories > 0
          ? (allCategories.length / totalCategories) * 100
          : 100;

      this.logger.log(
        `✅ Completed fetching categories: ${allCategories.length} categories ` +
          `(${completionRate.toFixed(1)}% completion rate)`,
      );

      return allCategories;
    } catch (error) {
      this.logger.error('Failed to fetch all categories:', error.message);

      if (error.response) {
        this.logger.error('KiotViet Categories API Error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        });
      }

      throw new BadRequestException(
        `Failed to fetch categories from KiotViet: ${error.message}`,
      );
    }
  }

  async fetchAllProducts(
    lastModifiedFrom?: string,
  ): Promise<ProductFetchResult> {
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

        if (batchNumber > 500) {
          this.logger.warn('Reached maximum batch limit (500), stopping fetch');
          break;
        }
      }

      this.logger.log(
        `Completed fetching all products: total ${allProducts.length} products`,
      );

      // FIXED: Return object with correct structure
      return {
        products: allProducts,
        totalFetched: allProducts.length,
      };
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

        return { newRecords, updatedRecords, skippedRecords: 0 };
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
          skippedRecords: results.skippedRecords,
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

        return { newRecords, updatedRecords, skippedRecords: 0 };
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
          skippedRecords: results.skippedRecords,
        },
      };
    } catch (error) {
      this.logger.error('Category sync failed:', error.message);
      throw new BadRequestException(`Category sync failed: ${error.message}`);
    }
  }

  async syncProducts(lastModifiedFrom?: string): Promise<SyncResult> {
    this.logger.log('Starting product synchronization from KiotViet');

    const errors: string[] = [];
    let totalSynced = 0;
    let totalUpdated = 0;

    try {
      const beforeSync = await this.prisma.product.count({
        where: { is_from_kiotviet: true },
      });

      const existingCategories = await this.prisma.kiotviet_category.findMany({
        select: { kiotviet_id: true },
      });
      const validCategoryIds = new Set(
        existingCategories.map((cat) => cat.kiotviet_id),
      );
      this.logger.log(
        `Found ${validCategoryIds.size} existing categories for validation`,
      );

      const existingTrademarks = await this.prisma.kiotviet_trademark.findMany({
        select: { kiotviet_id: true },
      });
      const validTrademarkIds = new Set(
        existingTrademarks.map((tm) => tm.kiotviet_id),
      );
      this.logger.log(
        `Found ${validTrademarkIds.size} existing trademarks for validation`,
      );

      const fetchResult = await this.fetchAllProducts(lastModifiedFrom);
      const kiotVietProducts = fetchResult.products;
      this.logger.log(
        `Fetched ${fetchResult.totalFetched} products from KiotViet`,
      );

      const results = await this.prisma.$transaction(
        async (prisma) => {
          let newRecords = 0;
          let updatedRecords = 0;
          let skippedRecords = 0;

          for (const kiotProduct of kiotVietProducts) {
            try {
              let categoryId: number | null = null;
              if (kiotProduct.categoryId) {
                if (validCategoryIds.has(kiotProduct.categoryId)) {
                  categoryId = kiotProduct.categoryId;
                } else {
                  this.logger.warn(
                    `Product ${kiotProduct.id}: Category ${kiotProduct.categoryId} not found, setting to null`,
                  );
                }
              }

              let trademarkId: number | null = null;
              if (kiotProduct.tradeMarkId) {
                if (validTrademarkIds.has(kiotProduct.tradeMarkId)) {
                  trademarkId = kiotProduct.tradeMarkId;
                } else {
                  this.logger.warn(
                    `Product ${kiotProduct.id}: Trademark ${kiotProduct.tradeMarkId} not found, setting to null`,
                  );
                }
              }

              const existingProduct = await prisma.product.findUnique({
                where: { kiotviet_id: BigInt(kiotProduct.id) },
                select: {
                  id: true,
                  is_visible: true,
                  title: true,
                },
              });

              let processedImages: string[] | undefined = undefined;

              if (
                kiotProduct.images &&
                Array.isArray(kiotProduct.images) &&
                kiotProduct.images.length > 0
              ) {
                const imageUrls = kiotProduct.images
                  .map((img) => {
                    if (
                      typeof img === 'object' &&
                      img !== null &&
                      'Image' in img
                    ) {
                      return img.Image;
                    } else if (typeof img === 'string') {
                      return img;
                    }
                    return null;
                  })
                  .filter(
                    (url): url is string =>
                      url !== null &&
                      typeof url === 'string' &&
                      url.trim().length > 0 &&
                      url.startsWith('http'),
                  );

                if (imageUrls.length > 0) {
                  processedImages = imageUrls;
                }
              }

              const productData: any = {
                kiotviet_id: BigInt(kiotProduct.id),
                kiotviet_code: kiotProduct.code,
                kiotviet_name: kiotProduct.name,
                kiotviet_price: kiotProduct.basePrice
                  ? new Prisma.Decimal(kiotProduct.basePrice)
                  : null,
                kiotviet_type: kiotProduct.type,
                kiotviet_category_id: categoryId,
                kiotviet_trademark_id: trademarkId,
                is_from_kiotviet: true,
                kiotviet_synced_at: new Date(),

                title: kiotProduct.name,
              };

              if (processedImages !== undefined) {
                productData.kiotviet_images = processedImages;
              }

              Object.keys(productData).forEach((key) => {
                if (productData[key] === undefined) {
                  delete productData[key];
                }
              });

              if (!existingProduct) {
                productData.is_visible = kiotProduct.allowsSale !== false;
              }

              if (existingProduct) {
                await prisma.product.update({
                  where: { kiotviet_id: BigInt(kiotProduct.id) },
                  data: productData,
                });
                updatedRecords++;
                this.logger.debug(
                  `Updated product: ${kiotProduct.name} (ID: ${kiotProduct.id})`,
                );
              } else {
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
          timeout: 300000,
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

  async fullSync(): Promise<FullSyncResult> {
    this.logger.log('Starting full KiotViet synchronization');

    const allErrors: string[] = [];

    try {
      this.logger.log('🔄 Step 1/3: Syncing trademarks...');
      const trademarksResult = await this.syncTrademarks();
      allErrors.push(...trademarksResult.errors);

      if (trademarksResult.success) {
        this.logger.log(
          `✅ Trademarks synced: ${trademarksResult.totalSynced} new, ${trademarksResult.totalUpdated} updated`,
        );
      } else {
        this.logger.warn(
          `⚠️ Trademarks sync had ${trademarksResult.errors.length} errors`,
        );
      }

      this.logger.log('🔄 Step 2/3: Syncing categories...');
      const categoriesResult = await this.syncCategories();
      allErrors.push(...categoriesResult.errors);

      if (categoriesResult.success) {
        this.logger.log(
          `✅ Categories synced: ${categoriesResult.totalSynced} new, ${categoriesResult.totalUpdated} updated`,
        );
      } else {
        this.logger.warn(
          `⚠️ Categories sync had ${categoriesResult.errors.length} errors`,
        );
      }

      this.logger.log('🔄 Step 3/3: Syncing products...');
      const productsResult = await this.syncProducts();
      allErrors.push(...productsResult.errors);

      if (productsResult.success) {
        this.logger.log(
          `✅ Products synced: ${productsResult.totalSynced} new, ${productsResult.totalUpdated} updated`,
        );
      } else {
        this.logger.warn(
          `⚠️ Products sync had ${productsResult.errors.length} errors`,
        );
      }

      const overallSuccess = allErrors.length === 0;

      this.logger.log(
        `🎯 Full sync completed ${overallSuccess ? 'successfully' : 'with errors'}. ` +
          `Total: ${trademarksResult.totalSynced + categoriesResult.totalSynced + productsResult.totalSynced} new items`,
      );

      return {
        success: overallSuccess,
        errors: allErrors,
        trademarks: trademarksResult,
        categories: categoriesResult,
        products: productsResult,
      };
    } catch (error) {
      this.logger.error('Full sync failed:', error.message);
      throw new BadRequestException(`Full sync failed: ${error.message}`);
    }
  }

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

  getSyncOrder(): SyncOrderStep[] {
    return [
      { step: 1, name: 'Trademarks', dependencies: [] },
      { step: 2, name: 'Categories', dependencies: [] },
      { step: 3, name: 'Products', dependencies: ['Trademarks', 'Categories'] },
    ];
  }

  async validateSyncPrerequisites(): Promise<ValidationResult> {
    const categoriesCount = await this.prisma.kiotviet_category.count();
    const trademarksCount = await this.prisma.kiotviet_trademark.count();

    const recommendations: string[] = [];
    let canSyncProducts = true;

    if (categoriesCount === 0) {
      recommendations.push('Sync categories first before syncing products');
      canSyncProducts = false;
    }

    if (trademarksCount === 0) {
      recommendations.push('Sync trademarks first before syncing products');
      canSyncProducts = false;
    }

    if (canSyncProducts) {
      recommendations.push('All prerequisites met - ready to sync products');
    }

    return {
      canSyncProducts,
      categoriesCount,
      trademarksCount,
      recommendations,
    };
  }
}
