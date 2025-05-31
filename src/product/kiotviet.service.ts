// src/product/kiotviet.service.ts - CLEANED VERSION
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

interface KiotVietCategory {
  categoryId: number;
  categoryName: string;
  parentId?: number;
  retailerId: number;
  createdDate: string;
  hasChild?: boolean;
  children?: KiotVietCategory[];
  rank?: number;
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

  // Cache for category data
  private categoriesCache: Map<string, number> = new Map();
  private categoriesCacheExpiry: number = 0;
  private hierarchicalCategoriesCache: KiotVietCategory[] = [];
  private hierarchicalCacheExpiry: number = 0;

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

  /**
   * Fetch hierarchical categories from KiotViet
   */
  async fetchHierarchicalCategories(): Promise<KiotVietCategory[]> {
    const now = Date.now();
    if (
      this.hierarchicalCategoriesCache.length > 0 &&
      now < this.hierarchicalCacheExpiry
    ) {
      this.logger.debug('Using cached hierarchical categories');
      return this.hierarchicalCategoriesCache;
    }

    await this.checkRateLimit();
    await this.setupAuthHeaders();

    try {
      const response: AxiosResponse<KiotVietCategoryResponse> =
        await this.axiosInstance.get('/categories', {
          params: {
            pageSize: 100,
            currentItem: 0,
            hierachicalData: true,
          },
        });

      this.requestCount++;

      this.hierarchicalCategoriesCache = response.data.data;
      this.hierarchicalCacheExpiry = now + 3600000; // Cache for 1 hour

      const categoriesWithChildren = response.data.data.filter(
        (cat) => cat.hasChild,
      );
      this.logger.log(
        `Fetched ${response.data.data.length} hierarchical categories, ${categoriesWithChildren.length} with children`,
      );

      return this.hierarchicalCategoriesCache;
    } catch (error) {
      this.logger.error(
        'Failed to fetch hierarchical categories:',
        error.message,
      );
      throw new BadRequestException(
        `Failed to fetch hierarchical categories from KiotViet: ${error.message}`,
      );
    }
  }

  /**
   * Fetch flat categories (for name-to-ID mapping)
   */
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

      this.categoriesCacheExpiry = now + 3600000; // Cache for 1 hour

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

  /**
   * Get category mapping for sync operations
   */
  async getCategoryMappingForSync(): Promise<{
    flatCategories: KiotVietCategory[];
    hierarchicalCategories: KiotVietCategory[];
    totalCount: number;
  }> {
    const hierarchicalCategories = await this.fetchHierarchicalCategories();
    const flatCategories = this.flattenCategoryHierarchy(
      hierarchicalCategories,
    );
    return {
      flatCategories,
      hierarchicalCategories,
      totalCount: flatCategories.length,
    };
  }

  /**
   * Flatten the hierarchical category structure
   */
  private flattenCategoryHierarchy(
    categories: KiotVietCategory[],
  ): KiotVietCategory[] {
    const flatList: KiotVietCategory[] = [];
    const processedIds = new Set<number>();

    const addToFlat = (cat: KiotVietCategory, depth: number = 0) => {
      if (processedIds.has(cat.categoryId) || depth > 10) {
        this.logger.warn(
          `Skipping category ${cat.categoryId} - already processed or max depth reached`,
        );
        return;
      }

      processedIds.add(cat.categoryId);

      flatList.push({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        parentId: cat.parentId,
        retailerId: cat.retailerId,
        createdDate: cat.createdDate,
        hasChild: cat.hasChild,
        rank: cat.rank,
      });

      this.logger.debug(
        `Flattened category: ${cat.categoryName} (ID: ${cat.categoryId}, Parent: ${cat.parentId || 'none'}, Depth: ${depth})`,
      );

      if (cat.children && cat.children.length > 0) {
        this.logger.debug(
          `Processing ${cat.children.length} children for category ${cat.categoryId}`,
        );
        cat.children.forEach((child) => addToFlat(child, depth + 1));
      }
    };

    categories.forEach((category) => addToFlat(category));

    this.logger.log(
      `Flattened ${flatList.length} total categories from ${categories.length} root categories`,
    );

    return flatList;
  }

  /**
   * Find all descendant category IDs for given parent IDs
   * This method specifically handles Lermao (2205381) and Trà Phượng Hoàng (2205374)
   */
  async findDescendantCategoryIds(parentIds: number[]): Promise<number[]> {
    this.logger.log(
      `Finding descendant categories for parent IDs: ${parentIds.join(', ')}`,
    );

    try {
      // Fetch hierarchical categories from KiotViet
      const hierarchicalCategories = await this.fetchHierarchicalCategories();
      const allCategories = this.flattenCategoryHierarchy(
        hierarchicalCategories,
      );

      const descendantIds: number[] = [];
      const processedIds = new Set<number>();

      const findDescendants = (parentId: number, depth: number = 0) => {
        if (processedIds.has(parentId) || depth > 10) {
          // Prevent infinite loops
          return;
        }

        processedIds.add(parentId);

        const children = allCategories.filter(
          (cat) => cat.parentId === parentId,
        );

        this.logger.debug(
          `Finding children for parent ${parentId} at depth ${depth}: found ${children.length} children`,
        );

        children.forEach((child) => {
          if (!descendantIds.includes(child.categoryId)) {
            descendantIds.push(child.categoryId);
            this.logger.debug(
              `Found child category: ${child.categoryName} (ID: ${child.categoryId}) under parent ${parentId}`,
            );

            // Recursively find children of this child
            findDescendants(child.categoryId, depth + 1);
          }
        });
      };

      // Add parent IDs first (include the parent categories themselves)
      parentIds.forEach((parentId) => {
        if (!descendantIds.includes(parentId)) {
          descendantIds.push(parentId);
        }
        findDescendants(parentId);
      });

      const uniqueDescendantIds = [...new Set(descendantIds)];

      this.logger.log(
        `Found ${uniqueDescendantIds.length} total categories (including parents and children)`,
      );

      // Log the specific categories found for Lermao and Trà Phượng Hoàng
      if (parentIds.includes(2205381) || parentIds.includes(2205374)) {
        const categoryNames = uniqueDescendantIds.map((id) => {
          const category = allCategories.find((cat) => cat.categoryId === id);
          return category
            ? `${category.categoryName} (${id})`
            : `Unknown (${id})`;
        });

        this.logger.log(
          `Lermao and Trà Phượng Hoàng category hierarchy: ${categoryNames.join(', ')}`,
        );
      }

      return uniqueDescendantIds;
    } catch (error) {
      this.logger.error('Error in findDescendantCategoryIds:', error.message);
      // Fallback to just the parent IDs if hierarchy fetching fails
      this.logger.log('Falling back to parent IDs only');
      return parentIds;
    }
  }

  /**
   * Get category IDs from category names
   */
  async getCategoryIds(categoryNames: string[]): Promise<number[]> {
    this.logger.log(`Looking up category IDs for: ${categoryNames.join(', ')}`);

    const categoryMap = await this.fetchCategories();
    const categoryIds: number[] = [];

    for (const categoryName of categoryNames) {
      const categoryId = categoryMap.get(categoryName);
      if (categoryId) {
        categoryIds.push(categoryId);
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

  /**
   * Fetch a batch of products from KiotViet
   */
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

  /**
   * Fetch products for a specific category
   */
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
    let consecutiveEmptyBatches = 0;
    const maxEmptyBatches = 3;

    while (hasMoreData && consecutiveEmptyBatches < maxEmptyBatches) {
      this.logger.debug(
        `Fetching batch ${batchNumber} for category ${categoryId} (items ${currentItem}-${
          currentItem + batchSize - 1
        })`,
      );

      try {
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

        if (batch.data.length === 0) {
          consecutiveEmptyBatches++;
          this.logger.debug(
            `Empty batch ${consecutiveEmptyBatches}/${maxEmptyBatches} for category ${categoryId}`,
          );
        } else {
          consecutiveEmptyBatches = 0;
        }

        if (batch.data.length < batchSize) {
          hasMoreData = false;
        } else {
          currentItem += batchSize;
          batchNumber++;
        }

        // Add delay between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(
          `Error fetching batch ${batchNumber} for category ${categoryId}: ${error.message}`,
        );

        if (
          error.message.includes('rate limit') ||
          error.response?.status === 429
        ) {
          this.logger.warn(
            `Rate limit hit for category ${categoryId}, waiting 60 seconds...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 60000));
          continue;
        }

        hasMoreData = false;
      }
    }

    if (consecutiveEmptyBatches >= maxEmptyBatches) {
      this.logger.warn(
        `Stopped fetching for category ${categoryId} after ${maxEmptyBatches} consecutive empty batches`,
      );
    }

    return { products, deletedIds, batchInfo };
  }

  /**
   * Fetch all products without category filter
   */
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

  /**
   * Main method to fetch all products with optional category filtering
   * Specifically optimized for Lermao and Trà Phượng Hoàng categories
   */
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
    let categoryIds: number[] | undefined;

    if (categoryNames && categoryNames.length > 0) {
      // If specific category names are provided, get their descendant IDs
      const targetParentIds = await this.getCategoryIds(categoryNames);
      const allDescendantIds =
        await this.findDescendantCategoryIds(targetParentIds);
      categoryIds = allDescendantIds;

      this.logger.log(
        `Filtering products by categories: ${categoryNames.join(', ')} (${categoryIds.length} total category IDs including children)`,
      );
    } else {
      // Default to Lermao and Trà Phượng Hoàng if no specific categories provided
      const targetParentIds = [
        2205381, 2205374, 2205387, 2205386, 2205385, 2205384, 2205383, 2205382,
        2205380, 2205379, 2205378, 2205377, 2205376, 2205375, 2205401, 2205373,
        2205372, 2276203,
      ]; // Lermao and Trà Phượng Hoàng
      const allDescendantIds =
        await this.findDescendantCategoryIds(targetParentIds);
      categoryIds = allDescendantIds;

      this.logger.log(
        `No specific categories provided, defaulting to Lermao and Trà Phượng Hoàng (${categoryIds.length} total category IDs including children)`,
      );
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
        // Fetch products for each category in the hierarchy
        this.logger.log(
          `Fetching products from ${categoryIds.length} categories`,
        );

        for (let i = 0; i < categoryIds.length; i++) {
          const categoryId = categoryIds[i];

          this.logger.log(
            `Fetching products for category ${categoryId} (${i + 1}/${categoryIds.length})`,
          );

          try {
            const categoryResult = await this.fetchProductsForCategory(
              categoryId,
              lastModifiedFrom,
            );

            this.logger.log(
              `Category ${categoryId}: Found ${categoryResult.products.length} products`,
            );

            allProducts.push(...categoryResult.products);
            allDeletedIds.push(...categoryResult.deletedIds);

            // Adjust batch numbering to be sequential across categories
            categoryResult.batchInfo.forEach((batch) => {
              batchInfo.push({
                ...batch,
                batchNumber: batchInfo.length + 1,
              });
            });

            // Small delay between categories
            if (i < categoryIds.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          } catch (categoryError) {
            this.logger.warn(
              `Failed to fetch products for category ${categoryId}: ${categoryError.message}`,
            );
            // Continue with other categories
          }
        }

        // Remove duplicate products (in case a product belongs to multiple categories)
        const uniqueProducts: KiotVietProduct[] = [];
        const seenProductIds = new Set<number>();

        for (const product of allProducts) {
          if (!seenProductIds.has(product.id)) {
            uniqueProducts.push(product);
            seenProductIds.add(product.id);
          }
        }

        this.logger.log(
          `Removed ${allProducts.length - uniqueProducts.length} duplicate products. Final count: ${uniqueProducts.length}`,
        );

        return {
          products: uniqueProducts,
          deletedIds: [...new Set(allDeletedIds)],
          totalFetched: uniqueProducts.length,
          batchInfo,
          filteredCategories: categoryNames,
        };
      } else {
        // Fetch all products without category filtering
        this.logger.log('Fetching all products (no category filtering)');
        const result =
          await this.fetchAllProductsWithoutFilter(lastModifiedFrom);

        return {
          products: result.products,
          deletedIds: result.deletedIds,
          totalFetched: result.products.length,
          batchInfo: result.batchInfo,
          filteredCategories: categoryNames,
        };
      }
    } catch (error) {
      this.logger.error('Failed to fetch all products:', error.message);
      throw error;
    }
  }

  /**
   * Test KiotViet connection
   */
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

  /**
   * Validate data integrity after fetching
   */
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
