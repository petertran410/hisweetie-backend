// src/product/kiotviet.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

interface KiotVietCategory {
  categoryId: number;
  categoryName: string;
  parentId?: number;
  retailerId: number;
  createdDate: string;
}

interface KiotVietCategoryResponse {
  total: number;
  pageSize: number;
  data: KiotVietCategory[];
  timestamp: string;
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
  fullName?: string;
  basePrice?: number;
  description?: string;
  images?: Array<string | { Image: string }>;
  unit?: string;
  modifiedDate?: string;
  createdDate?: string;
  allowsSale?: boolean;
  hasVariants?: boolean;
  weight?: number;
  isActive?: boolean;
  inventories?: Array<{
    productId: number;
    onHand: number;
  }>;
}

interface KiotVietApiResponse {
  total: number;
  pageSize: number;
  data: KiotVietProduct[];
  removeId?: number[];
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

  private currentToken: StoredToken | null = null;
  private requestCount = 0;
  private hourStartTime = Date.now();
  private readonly maxRequestsPerHour = 4900;

  private categoriesCache: Map<string, number> = new Map();
  private categoriesCacheExpiry: number = 0;

  constructor(private readonly configService: ConfigService) {
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
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
        `Rate limit approached. Waiting ${Math.ceil(waitTime / 1000)} seconds`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.hourStartTime = Date.now();
    }
  }

  async fetchCategories(): Promise<Map<string, number>> {
    const now = Date.now();
    if (this.categoriesCache.size > 0 && now < this.categoriesCacheExpiry) {
      this.logger.debug('Using cached categories');
      return this.categoriesCache;
    }

    this.logger.log('Fetching categories from KiotViet');

    await this.checkRateLimit();
    await this.setupAuthHeaders();

    try {
      const response: AxiosResponse<KiotVietCategoryResponse> =
        await this.axiosInstance.get('/categories', {
          params: {
            pageSize: 100,
            currentItem: 0,
            hierachicalData: false,
          },
        });

      this.requestCount++;
      this.logger.log(
        `Fetched ${response.data.data.length} categories from KiotViet`,
      );

      this.categoriesCache.clear();

      response.data.data.forEach((category) => {
        this.categoriesCache.set(category.categoryName, category.categoryId);
        this.logger.debug(
          `Mapped category: "${category.categoryName}" -> ID ${category.categoryId}`,
        );
      });

      this.categoriesCacheExpiry = now + 3600000;

      this.logger.log(
        `Built category mapping with ${this.categoriesCache.size} categories`,
      );
      return this.categoriesCache;
    } catch (error) {
      this.logger.error('Failed to fetch categories:', error.message);
      throw new BadRequestException(
        `Failed to fetch categories from KiotViet: ${error.message}`,
      );
    }
  }

  async getCategoryIds(categoryNames: string[]): Promise<number[]> {
    this.logger.log(`Looking up category IDs for: ${categoryNames.join(', ')}`);

    const categoryMap = await this.fetchCategories();
    const categoryIds: number[] = [];

    for (const categoryName of categoryNames) {
      const categoryId = categoryMap.get(categoryName);
      if (categoryId) {
        categoryIds.push(categoryId);
        this.logger.log(
          `Found category "${categoryName}" with ID: ${categoryId}`,
        );
      } else {
        this.logger.warn(
          `Category "${categoryName}" not found in KiotViet. Available categories: ${Array.from(
            categoryMap.keys(),
          ).join(', ')}`,
        );
      }
    }

    if (categoryIds.length === 0) {
      throw new BadRequestException(
        `None of the specified categories were found: ${categoryNames.join(', ')}`,
      );
    }

    this.logger.log(
      `Successfully resolved ${categoryIds.length} category IDs: ${categoryIds.join(', ')}`,
    );
    return categoryIds;
  }

  private async fetchProductBatch(
    currentItem: number = 0,
    pageSize: number = 100,
    lastModifiedFrom?: string,
    categoryIds?: number[],
  ): Promise<KiotVietApiResponse> {
    await this.checkRateLimit();
    await this.setupAuthHeaders();

    const params: any = {
      currentItem,
      pageSize,
      includeRemoveIds: true,
      includeInventory: true,
      orderBy: 'id',
      orderDirection: 'Asc',
    };

    if (categoryIds && categoryIds.length > 0) {
      params.categoryId = categoryIds[0];
      this.logger.debug(`Filtering by category ID: ${categoryIds[0]}`);
    }

    if (lastModifiedFrom) {
      params.lastModifiedFrom = lastModifiedFrom;
    }

    try {
      const response: AxiosResponse<KiotVietApiResponse> =
        await this.axiosInstance.get('/products', { params });

      this.requestCount++;
      this.logger.debug(
        `Fetched batch: currentItem=${currentItem}, returned ${response.data.data.length} products${
          categoryIds ? ` (filtered by category ${categoryIds[0]})` : ''
        }`,
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
          await this.axiosInstance.get('/products', { params });
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

  async fetchAllProducts(
    lastModifiedFrom?: string,
    categoryNames?: string[],
  ): Promise<{
    products: KiotVietProduct[];
    deletedIds: number[];
    totalFetched: number;
    batchInfo: Array<{
      batchNumber: number;
      itemsFetched: number;
      currentItem: number;
    }>;
    filteredCategories?: string[];
  }> {
    this.logger.log('Starting complete product synchronization from KiotViet');

    let categoryIds: number[] | undefined;
    if (categoryNames && categoryNames.length > 0) {
      this.logger.log(
        `Filtering products by categories: ${categoryNames.join(', ')}`,
      );
      categoryIds = await this.getCategoryIds(categoryNames);
    }

    const allProducts: KiotVietProduct[] = [];
    const allDeletedIds: number[] = [];
    const batchInfo: Array<{
      batchNumber: number;
      itemsFetched: number;
      currentItem: number;
    }> = [];

    try {
      if (categoryIds && categoryIds.length > 0) {
        this.logger.log(
          `Fetching products for ${categoryIds.length} categories`,
        );

        for (let i = 0; i < categoryIds.length; i++) {
          const categoryId = categoryIds[i];
          const categoryName = categoryNames![i];

          this.logger.log(
            `Fetching products for category: ${categoryName} (ID: ${categoryId})`,
          );

          const categoryResult = await this.fetchProductsForCategory(
            categoryId,
            lastModifiedFrom,
          );

          this.logger.log(
            `Category "${categoryName}": Found ${categoryResult.products.length} products`,
          );

          allProducts.push(...categoryResult.products);
          allDeletedIds.push(...categoryResult.deletedIds);

          categoryResult.batchInfo.forEach((batch) => {
            batchInfo.push({
              ...batch,
              batchNumber: batchInfo.length + 1,
            });
          });
        }

        this.logger.log(
          `Total products from all filtered categories: ${allProducts.length}`,
        );
      } else {
        this.logger.log('Fetching all products (no category filtering)');
        const result =
          await this.fetchAllProductsWithoutFilter(lastModifiedFrom);
        allProducts.push(...result.products);
        allDeletedIds.push(...result.deletedIds);
        batchInfo.push(...result.batchInfo);
      }

      // Enhanced validation and logging for debugging
      this.logger.log(`Final sync summary:
        - Total products fetched: ${allProducts.length}
        - Total deleted IDs: ${allDeletedIds.length}
        - Total batches processed: ${batchInfo.length}`);

      // Log sample of first few products for debugging
      if (allProducts.length > 0) {
        const sampleProducts = allProducts.slice(0, 3).map((p) => ({
          id: p.id,
          name: p.name,
          category: p.categoryName,
          price: p.basePrice,
        }));
        this.logger.log(
          'Sample products fetched:',
          JSON.stringify(sampleProducts, null, 2),
        );
      }

      this.logger.log(
        `Successfully fetched all products. Total: ${allProducts.length}, Deleted: ${allDeletedIds.length}`,
      );

      return {
        products: allProducts,
        deletedIds: allDeletedIds,
        totalFetched: allProducts.length,
        batchInfo,
        filteredCategories: categoryNames,
      };
    } catch (error) {
      this.logger.error('Failed to fetch all products:', error.message);
      throw error;
    }
  }

  private async fetchProductsForCategory(
    categoryId: number,
    lastModifiedFrom?: string,
  ): Promise<{
    products: KiotVietProduct[];
    deletedIds: number[];
    batchInfo: Array<{
      batchNumber: number;
      itemsFetched: number;
      currentItem: number;
    }>;
  }> {
    const products: KiotVietProduct[] = [];
    const deletedIds: number[] = [];
    const batchInfo: Array<{
      batchNumber: number;
      itemsFetched: number;
      currentItem: number;
    }> = [];

    let currentItem = 0;
    const batchSize = 100;
    let batchNumber = 1;
    let hasMoreData = true;

    while (hasMoreData) {
      this.logger.debug(
        `Fetching batch ${batchNumber} for category ${categoryId} (items ${currentItem}-${
          currentItem + batchSize - 1
        })`,
      );

      const batch = await this.fetchProductBatch(
        currentItem,
        batchSize,
        lastModifiedFrom,
        [categoryId],
      );

      products.push(...batch.data);

      if (batch.removeId && Array.isArray(batch.removeId)) {
        deletedIds.push(...batch.removeId);
      }

      batchInfo.push({
        batchNumber,
        itemsFetched: batch.data.length,
        currentItem,
      });

      this.logger.debug(
        `Category ${categoryId} batch ${batchNumber}: Fetched ${batch.data.length} products`,
      );

      if (batch.data.length < batchSize) {
        hasMoreData = false;
      } else {
        currentItem += batchSize;
        batchNumber++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return { products, deletedIds, batchInfo };
  }

  private async fetchAllProductsWithoutFilter(
    lastModifiedFrom?: string,
  ): Promise<{
    products: KiotVietProduct[];
    deletedIds: number[];
    batchInfo: Array<{
      batchNumber: number;
      itemsFetched: number;
      currentItem: number;
    }>;
  }> {
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

    this.logger.log('Fetching initial batch to determine total product count');
    const firstBatch = await this.fetchProductBatch(
      currentItem,
      batchSize,
      lastModifiedFrom,
    );

    totalProducts = firstBatch.total;
    this.logger.log(`Total products in KiotViet: ${totalProducts}`);

    if (totalProducts === 0) {
      this.logger.log('No products found in KiotViet');
      return { products: [], deletedIds: [], batchInfo: [] };
    }

    allProducts.push(...firstBatch.data);
    if (firstBatch.removeId && Array.isArray(firstBatch.removeId)) {
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
        `Processing batch ${batchNumber}/${totalBatches} (items ${currentItem}-${Math.min(
          currentItem + batchSize - 1,
          totalProducts - 1,
        )})`,
      );

      const batch = await this.fetchProductBatch(
        currentItem,
        batchSize,
        lastModifiedFrom,
      );

      allProducts.push(...batch.data);
      if (batch.removeId && Array.isArray(batch.removeId)) {
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

    return {
      products: allProducts,
      deletedIds: allDeletedIds,
      batchInfo,
    };
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
        `Found ${duplicateIds.length} duplicate product IDs: ${duplicateIds
          .slice(0, 5)
          .join(', ')}${duplicateIds.length > 5 ? '...' : ''}`,
      );
    }

    if (expectedTotal > 0 && products.length !== expectedTotal) {
      this.logger.log(
        `Product count difference: expected ${expectedTotal}, got ${products.length} (this is normal for filtered results)`,
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
