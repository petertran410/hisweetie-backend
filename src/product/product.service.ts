// src/product/product.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { prisma, PrismaClient } from '@prisma/client';
import { OrderSearchDto } from './dto/order-search.dto';
import { KiotVietService } from './kiotviet.service';

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

interface KiotVietCategory {
  categoryId: number;
  categoryName: string;
  parentId?: number;
  retailerId: number;
  createdDate: string;
  modifiedDate?: string;
  hasChild?: boolean;
}

interface SyncResult {
  success: boolean;
  totalSynced: number;
  totalDeleted: number;
  errors: string[];
  summary: {
    beforeSync: number;
    afterSync: number;
    newProducts: number;
    updatedProducts: number;
    deletedProducts: number;
    newCategories: number;
    updatedCategories: number;
    deletedCategories: number;
  };
  batchInfo: Array<{
    batchNumber: number;
    itemsFetched: number;
    currentItem: number;
  }>;
}

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  prisma = new PrismaClient();

  constructor(private readonly kiotVietService: KiotVietService) {}

  /**
   * Safe BigInt conversion with extensive validation and logging
   */
  private safeBigIntConversion(
    value: any,
    fieldName: string,
    productId?: number,
  ): bigint {
    try {
      if (value === null || value === undefined || value === '') {
        return BigInt(0);
      }

      if (typeof value === 'string') {
        const cleanValue = value.replace(/[^\d.-]/g, '');
        if (cleanValue === '' || cleanValue === '-') {
          return BigInt(0);
        }
        value = parseFloat(cleanValue);
      }

      const numericValue = Number(value);

      if (isNaN(numericValue) || !isFinite(numericValue)) {
        this.logger.warn(
          `${fieldName} for product ${productId} is invalid: ${value}, using 0`,
        );
        return BigInt(0);
      }

      const positiveValue = Math.max(0, Math.floor(numericValue));

      if (positiveValue > Number.MAX_SAFE_INTEGER) {
        this.logger.warn(
          `${fieldName} for product ${productId} exceeds max safe integer, capping`,
        );
        return BigInt(Number.MAX_SAFE_INTEGER);
      }

      return BigInt(positiveValue);
    } catch (error) {
      this.logger.error(
        `Error converting ${fieldName} for product ${productId}: ${error.message}, using 0`,
      );
      return BigInt(0);
    }
  }

  /**
   * Safe JSON stringify with error handling
   */
  private safeJsonStringify(
    data: any,
    fieldName: string,
    productId?: number,
  ): string | null {
    try {
      if (!data || (Array.isArray(data) && data.length === 0)) {
        return null;
      }

      if (Array.isArray(data)) {
        const validData = data.filter(
          (item) => item !== null && item !== undefined,
        );
        if (validData.length === 0) {
          return null;
        }
        return JSON.stringify(validData);
      }

      return JSON.stringify(data);
    } catch (error) {
      this.logger.error(
        `Error stringifying ${fieldName} for product ${productId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Enhanced string sanitization with comprehensive validation
   */
  private sanitizeString(value: any): string {
    try {
      if (value === null || value === undefined) {
        return '';
      }

      let stringValue = String(value);

      // Remove problematic characters that could cause database issues
      stringValue = stringValue
        .replace(/\0/g, '') // Remove null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
        .trim();

      // Limit length to prevent database overflow
      if (stringValue.length > 1000) {
        stringValue = stringValue.substring(0, 1000);
        this.logger.warn(`String truncated to 1000 characters`);
      }

      return stringValue;
    } catch (error) {
      this.logger.error(`Error sanitizing string: ${error.message}`);
      return '';
    }
  }

  // ===== NEW CATEGORY SYNCHRONIZATION METHODS =====

  /**
   * Synchronize categories from KiotViet to local database
   * This method handles the hierarchical nature of categories and ensures proper parent-child relationships
   */
  async syncCategoriesFromKiotViet(lastModifiedFrom?: string): Promise<{
    success: boolean;
    totalSynced: number;
    totalDeleted: number;
    errors: string[];
    summary: {
      beforeSync: number;
      afterSync: number;
      newCategories: number;
      updatedCategories: number;
      deletedCategories: number;
    };
  }> {
    this.logger.log('Starting category synchronization from KiotViet');

    const errors: string[] = [];
    let totalSynced = 0;
    let totalDeleted = 0;

    try {
      // Get current category count before sync
      const beforeSyncCount = await this.prisma.category.count();
      this.logger.log(`Current categories in database: ${beforeSyncCount}`);

      // Fetch categories from KiotViet
      this.logger.log('Fetching categories from KiotViet...');
      const fetchResult =
        await this.kiotVietService.fetchAllCategories(lastModifiedFrom);

      this.logger.log(
        `Fetched ${fetchResult.categories.length} categories from KiotViet`,
      );

      // Validate the fetched data structure
      if (!Array.isArray(fetchResult.categories)) {
        throw new Error(
          `Invalid categories data structure: expected array, got ${typeof fetchResult.categories}`,
        );
      }

      // Process the synchronization with improved transaction handling
      const syncResults = await this.prisma.$transaction(
        async (transactionClient) => {
          let newCategories = 0;
          let updatedCategories = 0;

          // Step 1: Handle deleted categories
          if (fetchResult.deletedIds && fetchResult.deletedIds.length > 0) {
            this.logger.log(
              `Processing ${fetchResult.deletedIds.length} deleted categories`,
            );

            try {
              const validDeletedIds = fetchResult.deletedIds
                .filter((id) => typeof id === 'number' && !isNaN(id) && id > 0)
                .map((id) => BigInt(id));

              if (validDeletedIds.length > 0) {
                // Delete product-category relationships first
                await transactionClient.product_categories.deleteMany({
                  where: { categories_id: { in: validDeletedIds } },
                });

                // Delete categories (handle child categories first)
                const deleteResult =
                  await transactionClient.category.deleteMany({
                    where: { id: { in: validDeletedIds } },
                  });

                totalDeleted = deleteResult.count;
                this.logger.log(
                  `Successfully deleted ${totalDeleted} categories from local database`,
                );
              }
            } catch (error) {
              const errorMsg = `Error deleting categories: ${error.message}`;
              this.logger.error(errorMsg);
              errors.push(errorMsg);
            }
          }

          // Step 2: Sort categories to handle parent-child relationships correctly
          // First process root categories (no parent), then children
          const sortedCategories = this.sortCategoriesForSync(
            fetchResult.categories,
          );

          // Step 3: Process categories in batches
          const batchSize = 20;
          const totalCategories = sortedCategories.length;
          this.logger.log(
            `Processing ${totalCategories} categories in batches of ${batchSize}`,
          );

          for (let i = 0; i < totalCategories; i += batchSize) {
            const batch = sortedCategories.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(totalCategories / batchSize);

            this.logger.log(
              `Processing category batch ${batchNumber}/${totalBatches} (${batch.length} categories)`,
            );

            for (const kiotVietCategory of batch) {
              try {
                // Validate essential category fields
                if (!kiotVietCategory || typeof kiotVietCategory !== 'object') {
                  errors.push(`Invalid category object`);
                  continue;
                }

                if (
                  !kiotVietCategory.categoryId ||
                  typeof kiotVietCategory.categoryId !== 'number'
                ) {
                  errors.push(
                    `Invalid or missing category ID: ${kiotVietCategory.categoryId}`,
                  );
                  continue;
                }

                this.logger.debug(
                  `Processing category ${kiotVietCategory.categoryId} - ${kiotVietCategory.categoryName}`,
                );

                // Map the category data to your schema structure
                const categoryData =
                  this.mapKiotVietCategoryToLocal(kiotVietCategory);

                if (!categoryData || typeof categoryData !== 'object') {
                  errors.push(
                    `Category ${kiotVietCategory.categoryId}: Failed to map category data`,
                  );
                  continue;
                }

                // Check if category exists
                let existingCategory: Awaited<
                  ReturnType<typeof transactionClient.category.findUnique>
                > = null;
                try {
                  existingCategory =
                    await transactionClient.category.findUnique({
                      where: { id: BigInt(kiotVietCategory.categoryId) },
                    });
                } catch (findError) {
                  this.logger.warn(
                    `Error checking if category ${kiotVietCategory.categoryId} exists: ${findError.message}`,
                  );
                }

                if (existingCategory) {
                  // Update existing category
                  try {
                    await transactionClient.category.update({
                      where: { id: BigInt(kiotVietCategory.categoryId) },
                      data: {
                        ...categoryData,
                        updated_date: new Date(),
                      },
                    });
                    updatedCategories++;
                    this.logger.debug(
                      `Updated category ${kiotVietCategory.categoryId} - ${kiotVietCategory.categoryName}`,
                    );
                  } catch (updateError) {
                    const errorMsg = `Failed to update category ${kiotVietCategory.categoryId}: ${updateError.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                  }
                } else {
                  // Create new category
                  try {
                    await transactionClient.category.create({
                      data: {
                        id: BigInt(kiotVietCategory.categoryId),
                        ...categoryData,
                        created_date: kiotVietCategory.createdDate
                          ? new Date(kiotVietCategory.createdDate)
                          : new Date(),
                        updated_date: new Date(),
                      },
                    });
                    newCategories++;
                    this.logger.debug(
                      `Created new category ${kiotVietCategory.categoryId} - ${kiotVietCategory.categoryName}`,
                    );
                  } catch (createError) {
                    const errorMsg = `Failed to create category ${kiotVietCategory.categoryId}: ${createError.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                  }
                }
              } catch (categoryError) {
                const errorMsg = `Failed to process category ${kiotVietCategory?.categoryId || 'unknown'}: ${categoryError.message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);
              }
            }

            // Progress update
            this.logger.log(
              `Completed category batch ${batchNumber}/${totalBatches}. Progress: ${Math.round(((i + batch.length) / totalCategories) * 100)}%`,
            );

            // Add small delay between batches
            if (batchNumber < totalBatches) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          }

          totalSynced = newCategories + updatedCategories;
          this.logger.log(
            `Category sync summary: ${newCategories} new, ${updatedCategories} updated, ${totalSynced} total synced`,
          );

          return { newCategories, updatedCategories };
        },
        {
          timeout: 300000, // 5 minute timeout for category sync
          isolationLevel: 'Serializable',
        },
      );

      // Get final count after sync
      const afterSyncCount = await this.prisma.category.count();

      const result = {
        success: errors.length === 0,
        totalSynced,
        totalDeleted,
        errors,
        summary: {
          beforeSync: beforeSyncCount,
          afterSync: afterSyncCount,
          newCategories: syncResults.newCategories,
          updatedCategories: syncResults.updatedCategories,
          deletedCategories: totalDeleted,
        },
      };

      if (result.success) {
        this.logger.log('Category synchronization completed successfully', {
          totalSynced: result.totalSynced,
          totalDeleted: result.totalDeleted,
        });
      } else {
        this.logger.warn('Category synchronization completed with errors', {
          totalSynced: result.totalSynced,
          totalDeleted: result.totalDeleted,
          errorCount: result.errors.length,
        });
      }

      return result;
    } catch (error) {
      this.logger.error(
        'Category synchronization failed with critical error:',
        error.message,
      );

      return {
        success: false,
        totalSynced: 0,
        totalDeleted: 0,
        errors: [`Critical category sync error: ${error.message}`],
        summary: {
          beforeSync: 0,
          afterSync: 0,
          newCategories: 0,
          updatedCategories: 0,
          deletedCategories: 0,
        },
      };
    }
  }

  /**
   * Sort categories to ensure parent categories are processed before child categories
   * This is crucial for maintaining referential integrity in hierarchical data
   */
  private sortCategoriesForSync(
    categories: KiotVietCategory[],
  ): KiotVietCategory[] {
    const rootCategories: KiotVietCategory[] = [];
    const childCategories: KiotVietCategory[] = [];

    // Separate root and child categories
    categories.forEach((category) => {
      if (!category.parentId) {
        rootCategories.push(category);
      } else {
        childCategories.push(category);
      }
    });

    // Sort child categories by their parent relationships
    // This is a simple approach; for more complex hierarchies, you might need a topological sort
    const sortedChildren = childCategories.sort((a, b) => {
      // If a category's parent is in the current list, it should come after its parent
      const aParentExists = childCategories.find(
        (c) => c.categoryId === a.parentId,
      );
      const bParentExists = childCategories.find(
        (c) => c.categoryId === b.parentId,
      );

      if (aParentExists && !bParentExists) return 1;
      if (!aParentExists && bParentExists) return -1;
      return 0;
    });

    this.logger.log(
      `Sorted categories: ${rootCategories.length} root categories, ${sortedChildren.length} child categories`,
    );

    // Return root categories first, then children
    return [...rootCategories, ...sortedChildren];
  }

  /**
   * Map KiotViet category to local database structure
   */
  private mapKiotVietCategoryToLocal(kiotVietCategory: KiotVietCategory): any {
    const categoryId = kiotVietCategory.categoryId;

    try {
      // Handle name with sanitization
      const name = this.sanitizeString(
        kiotVietCategory.categoryName || `Category ${categoryId}`,
      );

      // Handle parent ID conversion
      const parent_id = kiotVietCategory.parentId
        ? BigInt(kiotVietCategory.parentId)
        : null;

      // Default values for other fields
      const description = null; // KiotViet doesn't provide description in the API
      const images_url = null; // KiotViet doesn't provide images for categories in this API
      const priority = 0; // Default priority

      return {
        name,
        description,
        parent_id,
        images_url,
        priority,
      };
    } catch (error) {
      this.logger.error(
        `Critical error mapping category ${categoryId}: ${error.message}`,
      );
      // Return a minimal safe object that matches your schema
      return {
        name: `Error Category ${categoryId}`,
        description: `Error: ${error.message}`,
        parent_id: null,
        images_url: null,
        priority: 0,
      };
    }
  }

  // ===== ENHANCED PRODUCT SYNCHRONIZATION WITH CATEGORY RELATIONSHIPS =====

  /**
   * Map KiotViet product to local database structure with enhanced category handling
   */
  private mapKiotVietProductToLocal(kiotVietProduct: KiotVietProduct): any {
    const productId = kiotVietProduct.id;

    try {
      // Handle title with fallback chain
      const title = this.sanitizeString(
        kiotVietProduct.name ||
          kiotVietProduct.fullName ||
          `Product ${productId}`,
      );

      // Handle price conversion safely
      const price = this.safeBigIntConversion(
        kiotVietProduct.basePrice,
        'price',
        productId,
      );

      // Handle quantity conversion with inventory data
      let quantityValue = 1; // Default quantity
      if (
        kiotVietProduct.inventories &&
        Array.isArray(kiotVietProduct.inventories)
      ) {
        const totalOnHand = kiotVietProduct.inventories.reduce((sum, inv) => {
          if (inv && typeof inv.onHand === 'number' && !isNaN(inv.onHand)) {
            return sum + Math.max(0, inv.onHand);
          }
          return sum;
        }, 0);
        if (totalOnHand > 0) {
          quantityValue = totalOnHand;
        }
      }
      const quantity = this.safeBigIntConversion(
        quantityValue,
        'quantity',
        productId,
      );

      // Handle images array safely - Process both image data structures
      let imageUrls: string[] = [];
      if (kiotVietProduct.images && Array.isArray(kiotVietProduct.images)) {
        this.logger.debug(
          `Processing ${kiotVietProduct.images.length} images for product ${productId}`,
        );

        imageUrls = kiotVietProduct.images
          .map((img, index) => {
            let imageUrl: string | null = null;

            if (typeof img === 'string') {
              imageUrl = img;
              this.logger.debug(
                `Image ${index} for product ${productId}: direct string URL`,
              );
            } else if (
              img &&
              typeof img === 'object' &&
              img.Image &&
              typeof img.Image === 'string'
            ) {
              imageUrl = img.Image;
              this.logger.debug(
                `Image ${index} for product ${productId}: object with Image property`,
              );
            } else {
              this.logger.warn(
                `Image ${index} for product ${productId}: unexpected structure`,
                img,
              );
              return null;
            }

            if (imageUrl && typeof imageUrl === 'string') {
              const cleanUrl = imageUrl.trim();
              if (
                cleanUrl.length > 0 &&
                (cleanUrl.startsWith('http://') ||
                  cleanUrl.startsWith('https://'))
              ) {
                return cleanUrl;
              } else {
                this.logger.warn(
                  `Image ${index} for product ${productId}: invalid URL format: ${cleanUrl}`,
                );
              }
            }

            return null;
          })
          .filter((url): url is string => url !== null);

        this.logger.debug(
          `Product ${productId}: processed ${imageUrls.length} valid images out of ${kiotVietProduct.images.length} total`,
        );
      } else {
        this.logger.debug(
          `Product ${productId}: no images array found or array is empty`,
        );
      }

      const images_url = this.safeJsonStringify(imageUrls, 'images', productId);
      const featured_thumbnail = imageUrls.length > 0 ? imageUrls[0] : null;

      // Handle text fields with safe sanitization
      const description = this.sanitizeString(
        kiotVietProduct.description || '',
      );
      const general_description = this.sanitizeString(
        kiotVietProduct.fullName || kiotVietProduct.name || '',
      );
      const type = this.sanitizeString(kiotVietProduct.unit || 'piece');

      // Return object that matches your Prisma schema
      return {
        title,
        price,
        quantity,
        description,
        images_url,
        general_description,
        instruction: '', // Default empty string
        is_featured: false, // Default false
        featured_thumbnail,
        recipe_thumbnail: null, // Default null
        type,
        // Store category info for later processing
        categoryId: kiotVietProduct.categoryId,
        categoryName: kiotVietProduct.categoryName,
      };
    } catch (error) {
      this.logger.error(
        `Critical error mapping product ${productId}: ${error.message}`,
      );
      // Return a minimal safe object that matches your schema
      return {
        title: `Error Product ${productId}`,
        price: BigInt(0),
        quantity: BigInt(0),
        description: `Error: ${error.message}`,
        images_url: null,
        general_description: '',
        instruction: '',
        is_featured: false,
        featured_thumbnail: null,
        recipe_thumbnail: null,
        type: 'error',
        categoryId: null,
        categoryName: null,
      };
    }
  }

  /**
   * Enhanced synchronization with both categories and products
   */
  async syncProductsAndCategoriesFromKiotViet(
    lastModifiedFrom?: string,
    categoryNames?: string[],
  ): Promise<SyncResult> {
    this.logger.log(
      'Starting comprehensive synchronization from KiotViet (categories + products)',
    );

    if (categoryNames && categoryNames.length > 0) {
      this.logger.log(
        `Filtering sync to categories: ${categoryNames.join(', ')}`,
      );
    } else {
      this.logger.log('Syncing all categories and products');
    }

    const errors: string[] = [];
    let totalSynced = 0;
    let totalDeleted = 0;

    try {
      // Step 1: Sync categories first (crucial for referential integrity)
      this.logger.log('Phase 1: Synchronizing categories...');
      const categorySync =
        await this.syncCategoriesFromKiotViet(lastModifiedFrom);

      if (!categorySync.success) {
        this.logger.warn(
          'Category sync had issues, but continuing with product sync',
        );
        errors.push(...categorySync.errors);
      }

      // Step 2: Sync products with category relationships
      this.logger.log('Phase 2: Synchronizing products...');
      const productSync = await this.syncProductsFromKiotViet(
        lastModifiedFrom,
        categoryNames,
      );

      if (!productSync.success) {
        errors.push(...productSync.errors);
      }

      // Combine results
      totalSynced = categorySync.totalSynced + productSync.totalSynced;
      totalDeleted = categorySync.totalDeleted + productSync.totalDeleted;

      const result: SyncResult = {
        success: errors.length === 0,
        totalSynced,
        totalDeleted,
        errors,
        summary: {
          beforeSync:
            categorySync.summary.beforeSync + productSync.summary.beforeSync,
          afterSync:
            categorySync.summary.afterSync + productSync.summary.afterSync,
          newProducts: productSync.summary.newProducts,
          updatedProducts: productSync.summary.updatedProducts,
          deletedProducts: productSync.summary.deletedProducts,
          newCategories: categorySync.summary.newCategories,
          updatedCategories: categorySync.summary.updatedCategories,
          deletedCategories: categorySync.summary.deletedCategories,
        },
        batchInfo: productSync.batchInfo, // Product batch info is typically more relevant
      };

      if (result.success) {
        this.logger.log(
          'Comprehensive synchronization completed successfully',
          {
            totalCategoriesSynced: categorySync.totalSynced,
            totalProductsSynced: productSync.totalSynced,
            totalDeleted: result.totalDeleted,
          },
        );
      } else {
        this.logger.warn(
          'Comprehensive synchronization completed with errors',
          {
            totalCategoriesSynced: categorySync.totalSynced,
            totalProductsSynced: productSync.totalSynced,
            totalDeleted: result.totalDeleted,
            errorCount: result.errors.length,
          },
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        'Comprehensive synchronization failed with critical error:',
        error.message,
      );

      return {
        success: false,
        totalSynced: 0,
        totalDeleted: 0,
        errors: [`Critical comprehensive sync error: ${error.message}`],
        summary: {
          beforeSync: 0,
          afterSync: 0,
          newProducts: 0,
          updatedProducts: 0,
          deletedProducts: 0,
          newCategories: 0,
          updatedCategories: 0,
          deletedCategories: 0,
        },
        batchInfo: [],
      };
    }
  }

  /**
   * Enhanced product synchronization with category relationship handling
   */
  async syncProductsFromKiotViet(
    lastModifiedFrom?: string,
    categoryNames?: string[],
  ): Promise<SyncResult> {
    this.logger.log('Starting product synchronization from KiotViet');

    if (categoryNames && categoryNames.length > 0) {
      this.logger.log(
        `Filtering sync to categories: ${categoryNames.join(', ')}`,
      );
    } else {
      this.logger.log('Syncing all products (no category filtering)');
    }

    const errors: string[] = [];
    let totalSynced = 0;
    let totalDeleted = 0;

    try {
      // Get current product count before sync
      const beforeSyncCount = await this.prisma.product.count();
      this.logger.log(`Current products in database: ${beforeSyncCount}`);

      // Fetch products from KiotViet with optional category filtering
      this.logger.log('Fetching products from KiotViet...');
      const fetchResult = await this.kiotVietService.fetchAllProducts(
        lastModifiedFrom,
        categoryNames,
      );

      if (categoryNames) {
        this.logger.log(
          `Fetched ${fetchResult.products.length} products from categories: ${categoryNames.join(', ')}`,
        );
      } else {
        this.logger.log(
          `Fetched ${fetchResult.products.length} products from KiotViet`,
        );
      }

      // Validate the fetched data structure
      if (!Array.isArray(fetchResult.products)) {
        throw new Error(
          `Invalid products data structure: expected array, got ${typeof fetchResult.products}`,
        );
      }

      // Validate data integrity
      const validation = this.kiotVietService.validateDataIntegrity(
        fetchResult.products,
        fetchResult.totalFetched,
        fetchResult.batchInfo,
      );

      if (!validation.isValid) {
        this.logger.warn('Data integrity issues detected:', validation.issues);
        errors.push(...validation.issues);
      }

      // Process the synchronization with improved transaction handling
      const syncResults = await this.prisma.$transaction(
        async (transactionClient) => {
          let newProducts = 0;
          let updatedProducts = 0;

          // Step 1: Handle deleted products
          if (fetchResult.deletedIds && fetchResult.deletedIds.length > 0) {
            this.logger.log(
              `Processing ${fetchResult.deletedIds.length} deleted products`,
            );

            try {
              const validDeletedIds = fetchResult.deletedIds
                .filter((id) => typeof id === 'number' && !isNaN(id) && id > 0)
                .map((id) => BigInt(id));

              if (validDeletedIds.length > 0) {
                // Delete associated records first to avoid foreign key constraints
                await transactionClient.orders.deleteMany({
                  where: {
                    product: {
                      id: { in: validDeletedIds },
                    },
                  },
                });

                await transactionClient.review.deleteMany({
                  where: { product_id: { in: validDeletedIds } },
                });

                await transactionClient.product_categories.deleteMany({
                  where: { product_id: { in: validDeletedIds } },
                });

                const deleteResult = await transactionClient.product.deleteMany(
                  {
                    where: { id: { in: validDeletedIds } },
                  },
                );

                totalDeleted = deleteResult.count;
                this.logger.log(
                  `Successfully deleted ${totalDeleted} products from local database`,
                );
              }
            } catch (error) {
              const errorMsg = `Error deleting products: ${error.message}`;
              this.logger.error(errorMsg);
              errors.push(errorMsg);
            }
          }

          // Step 2: Process products in smaller batches with improved error handling
          const batchSize = 20; // Reduced batch size for better stability
          const totalProducts = fetchResult.products.length;
          this.logger.log(
            `Processing ${totalProducts} products in batches of ${batchSize}`,
          );

          for (let i = 0; i < totalProducts; i += batchSize) {
            const batch = fetchResult.products.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(totalProducts / batchSize);

            this.logger.log(
              `Processing batch ${batchNumber}/${totalBatches} (${batch.length} products)`,
            );

            for (const kiotVietProduct of batch) {
              try {
                // Validate essential product fields
                if (!kiotVietProduct || typeof kiotVietProduct !== 'object') {
                  errors.push(`Invalid product object`);
                  continue;
                }

                if (
                  !kiotVietProduct.id ||
                  typeof kiotVietProduct.id !== 'number'
                ) {
                  errors.push(
                    `Invalid or missing product ID: ${kiotVietProduct.id}`,
                  );
                  continue;
                }

                this.logger.debug(
                  `Processing product ${kiotVietProduct.id} - ${kiotVietProduct.name}`,
                );

                // Map the product data to your schema structure
                const productData =
                  this.mapKiotVietProductToLocal(kiotVietProduct);

                if (!productData || typeof productData !== 'object') {
                  errors.push(
                    `Product ${kiotVietProduct.id}: Failed to map product data`,
                  );
                  continue;
                }

                // Extract category info for later processing
                const categoryId = productData.categoryId;
                const categoryName = productData.categoryName;

                // Remove category info from product data (it's not part of the product table)
                delete productData.categoryId;
                delete productData.categoryName;

                // Check if product exists with proper error handling
                let existingProduct: Awaited<
                  ReturnType<typeof transactionClient.product.findUnique>
                > = null;

                try {
                  existingProduct = await transactionClient.product.findUnique({
                    where: { id: BigInt(kiotVietProduct.id) },
                  });
                } catch (findError) {
                  this.logger.warn(
                    `Error checking if product ${kiotVietProduct.id} exists: ${findError.message}`,
                  );
                }

                if (existingProduct) {
                  // Update existing product with comprehensive error handling
                  try {
                    await transactionClient.product.update({
                      where: { id: BigInt(kiotVietProduct.id) },
                      data: {
                        ...productData,
                        updated_date: new Date(),
                      },
                    });
                    updatedProducts++;
                    this.logger.debug(
                      `Updated product ${kiotVietProduct.id} - ${kiotVietProduct.name}`,
                    );
                  } catch (updateError) {
                    const errorMsg = `Failed to update product ${kiotVietProduct.id}: ${updateError.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                    continue; // Skip category relationship update if product update failed
                  }
                } else {
                  // Create new product with comprehensive error handling
                  try {
                    await transactionClient.product.create({
                      data: {
                        id: BigInt(kiotVietProduct.id),
                        ...productData,
                        created_date: kiotVietProduct.createdDate
                          ? new Date(kiotVietProduct.createdDate)
                          : new Date(),
                        updated_date: new Date(),
                      },
                    });
                    newProducts++;
                    this.logger.debug(
                      `Created new product ${kiotVietProduct.id} - ${kiotVietProduct.name}`,
                    );
                  } catch (createError) {
                    const errorMsg = `Failed to create product ${kiotVietProduct.id}: ${createError.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                    continue; // Skip category relationship creation if product creation failed
                  }
                }

                // Step 3: Handle product-category relationships
                if (categoryId && typeof categoryId === 'number') {
                  try {
                    // First, remove existing category relationships for this product
                    await transactionClient.product_categories.deleteMany({
                      where: { product_id: BigInt(kiotVietProduct.id) },
                    });

                    // Check if the category exists in our database
                    const categoryExists =
                      await transactionClient.category.findUnique({
                        where: { id: BigInt(categoryId) },
                      });

                    if (categoryExists) {
                      // Create new product-category relationship
                      await transactionClient.product_categories.create({
                        data: {
                          product_id: BigInt(kiotVietProduct.id),
                          categories_id: BigInt(categoryId),
                        },
                      });
                      this.logger.debug(
                        `Linked product ${kiotVietProduct.id} to category ${categoryId} (${categoryName})`,
                      );
                    } else {
                      this.logger.warn(
                        `Category ${categoryId} (${categoryName}) not found in database for product ${kiotVietProduct.id}`,
                      );
                      errors.push(
                        `Product ${kiotVietProduct.id}: Category ${categoryId} not found in database`,
                      );
                    }
                  } catch (relationshipError) {
                    const errorMsg = `Failed to create product-category relationship for product ${kiotVietProduct.id}, category ${categoryId}: ${relationshipError.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                  }
                } else {
                  this.logger.debug(
                    `Product ${kiotVietProduct.id} has no category information`,
                  );
                }
              } catch (productError) {
                const errorMsg = `Failed to process product ${kiotVietProduct?.id || 'unknown'}: ${productError.message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);
              }
            }

            // Progress update
            this.logger.log(
              `Completed batch ${batchNumber}/${totalBatches}. Progress: ${Math.round(((i + batch.length) / totalProducts) * 100)}%`,
            );

            // Add small delay between batches to prevent overwhelming the database
            if (batchNumber < totalBatches) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }

          totalSynced = newProducts + updatedProducts;
          this.logger.log(
            `Sync summary: ${newProducts} new, ${updatedProducts} updated, ${totalSynced} total synced`,
          );

          return { newProducts, updatedProducts };
        },
        {
          timeout: 900000, // 15 minute timeout for very large syncs
          isolationLevel: 'Serializable',
        },
      );

      // Get final count after sync
      const afterSyncCount = await this.prisma.product.count();

      const result: SyncResult = {
        success: errors.length === 0,
        totalSynced,
        totalDeleted,
        errors,
        summary: {
          beforeSync: beforeSyncCount,
          afterSync: afterSyncCount,
          newProducts: syncResults.newProducts,
          updatedProducts: syncResults.updatedProducts,
          deletedProducts: totalDeleted,
          newCategories: 0,
          updatedCategories: 0,
          deletedCategories: 0,
        },
        batchInfo: fetchResult.batchInfo,
      };

      if (result.success) {
        this.logger.log('Product synchronization completed successfully', {
          totalSynced: result.totalSynced,
          totalDeleted: result.totalDeleted,
          filteredCategories: fetchResult.filteredCategories,
        });
      } else {
        this.logger.warn('Product synchronization completed with errors', {
          totalSynced: result.totalSynced,
          totalDeleted: result.totalDeleted,
          errorCount: result.errors.length,
          filteredCategories: fetchResult.filteredCategories,
        });
      }

      return result;
    } catch (error) {
      this.logger.error(
        'Product synchronization failed with critical error:',
        error.message,
      );

      return {
        success: false,
        totalSynced: 0,
        totalDeleted: 0,
        errors: [`Critical sync error: ${error.message}`],
        summary: {
          beforeSync: 0,
          afterSync: 0,
          newProducts: 0,
          updatedProducts: 0,
          deletedProducts: 0,
          newCategories: 0,
          updatedCategories: 0,
          deletedCategories: 0,
        },
        batchInfo: [],
      };
    }
  }

  /**
   * Enhanced force sync with comprehensive category and product synchronization
   */
  async forceFullSync(categoryNames?: string[]): Promise<SyncResult> {
    if (categoryNames && categoryNames.length > 0) {
      this.logger.log(
        `Starting force full sync for categories: ${categoryNames.join(', ')}`,
      );
    } else {
      this.logger.log(
        'Starting force full sync - this will replace all products and categories',
      );
    }

    try {
      const beforeCount = await this.prisma.product.count();
      const beforeCategoryCount = await this.prisma.category.count();
      this.logger.log(
        `Current counts before sync: ${beforeCount} products, ${beforeCategoryCount} categories`,
      );

      // Use the comprehensive sync method
      const syncResult = await this.syncProductsAndCategoriesFromKiotViet(
        undefined,
        categoryNames,
      );

      if (syncResult.success) {
        if (categoryNames) {
          this.logger.log(
            `Force sync for categories [${categoryNames.join(', ')}] completed successfully. ` +
              `Products: ${beforeCount} → ${syncResult.summary.afterSync} (${syncResult.summary.newProducts + syncResult.summary.updatedProducts} synced), ` +
              `Categories: ${beforeCategoryCount} → ${syncResult.summary.newCategories + syncResult.summary.updatedCategories} synced`,
          );
        } else {
          this.logger.log(
            `Force full sync completed successfully. ` +
              `Products: ${beforeCount} → ${syncResult.summary.afterSync}, ` +
              `Categories synced: ${syncResult.summary.newCategories + syncResult.summary.updatedCategories}`,
          );
        }
      } else {
        this.logger.error(
          'Force sync completed with errors:',
          syncResult.errors.slice(0, 5),
        );
      }

      return syncResult;
    } catch (error) {
      this.logger.error('Force sync failed:', error.message);
      throw new BadRequestException(`Force sync failed: ${error.message}`);
    }
  }

  /**
   * Enhanced incremental sync with category and product synchronization
   */
  async incrementalSync(
    since?: string,
    categoryNames?: string[],
  ): Promise<SyncResult> {
    const lastModifiedFrom = since || (await this.getLastSyncTimestamp());

    if (categoryNames && categoryNames.length > 0) {
      this.logger.log(
        `Starting incremental sync for categories [${categoryNames.join(', ')}] since: ${lastModifiedFrom}`,
      );
    } else {
      this.logger.log(`Starting incremental sync since: ${lastModifiedFrom}`);
    }

    const result = await this.syncProductsAndCategoriesFromKiotViet(
      lastModifiedFrom,
      categoryNames,
    );

    if (result.success) {
      await this.updateLastSyncTimestamp();
      this.logger.log('Incremental sync completed successfully');
    } else {
      this.logger.error('Incremental sync completed with errors');
    }

    return result;
  }

  /**
   * Get the timestamp of the last successful sync
   */
  private async getLastSyncTimestamp(): Promise<string> {
    try {
      const latestProduct = await this.prisma.product.findFirst({
        orderBy: { updated_date: 'desc' },
        select: { updated_date: true },
      });

      return (
        latestProduct?.updated_date?.toISOString() ||
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      );
    } catch (error) {
      this.logger.warn(
        'Could not determine last sync timestamp, using 24 hours ago',
      );
      return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }
  }

  /**
   * Update the last sync timestamp
   */
  private async updateLastSyncTimestamp(): Promise<void> {
    this.logger.log(`Last sync completed at: ${new Date().toISOString()}`);
  }

  /**
   * Enhanced clean database and sync only specific categories
   */
  async cleanAndSyncCategories(categoryNames: string[]): Promise<
    SyncResult & {
      cleanupInfo: {
        deletedProducts: number;
        deletedOrders: number;
        deletedReviews: number;
        deletedRelations: number;
        deletedCategories: number;
      };
    }
  > {
    this.logger.log(
      `Starting clean database and category sync for: ${categoryNames.join(', ')}`,
    );

    if (!categoryNames || categoryNames.length === 0) {
      throw new BadRequestException('At least one category name is required');
    }

    try {
      const beforeCleanupCount = await this.prisma.product.count();
      const beforeCategoryCount = await this.prisma.category.count();
      this.logger.log(
        `Current data before cleanup: ${beforeCleanupCount} products, ${beforeCategoryCount} categories`,
      );

      const beforeOrdersCount = await this.prisma.orders.count();
      const beforeReviewsCount = await this.prisma.review.count();
      const beforeRelationsCount = await this.prisma.product_categories.count();

      this.logger.log(
        `Related data before cleanup: ${beforeOrdersCount} orders, ${beforeReviewsCount} reviews, ${beforeRelationsCount} category relations`,
      );

      // Clear all products, categories and related data from database
      const cleanupResults = await this.prisma.$transaction(async (prisma) => {
        this.logger.log('Starting database cleanup transaction...');

        const deletedOrders = await prisma.orders.deleteMany({});
        this.logger.log(`Deleted ${deletedOrders.count} orders`);

        const deletedReviews = await prisma.review.deleteMany({});
        this.logger.log(`Deleted ${deletedReviews.count} reviews`);

        const deletedRelations = await prisma.product_categories.deleteMany({});
        this.logger.log(
          `Deleted ${deletedRelations.count} product-category relationships`,
        );

        const deletedProducts = await prisma.product.deleteMany({});
        this.logger.log(`Deleted ${deletedProducts.count} products`);

        const deletedCategories = await prisma.category.deleteMany({});
        this.logger.log(`Deleted ${deletedCategories.count} categories`);

        return {
          deletedProducts: deletedProducts.count,
          deletedOrders: deletedOrders.count,
          deletedReviews: deletedReviews.count,
          deletedRelations: deletedRelations.count,
          deletedCategories: deletedCategories.count,
        };
      });

      // Verify database is clean
      const afterCleanupProductCount = await this.prisma.product.count();
      const afterCleanupCategoryCount = await this.prisma.category.count();
      if (afterCleanupProductCount !== 0 || afterCleanupCategoryCount !== 0) {
        throw new Error(
          `Database cleanup failed: ${afterCleanupProductCount} products and ${afterCleanupCategoryCount} categories still remain`,
        );
      }
      this.logger.log(
        'Database successfully cleaned - no products, categories, or related data remain',
      );

      // Perform fresh sync with only specified categories
      this.logger.log(
        `Now syncing fresh data for categories: ${categoryNames.join(', ')}`,
      );
      const syncResult = await this.syncProductsAndCategoriesFromKiotViet(
        undefined,
        categoryNames,
      );

      const enhancedResult = {
        ...syncResult,
        cleanupInfo: cleanupResults,
      };

      if (syncResult.success) {
        this.logger.log(
          `Clean and sync completed successfully! ` +
            `Removed ${cleanupResults.deletedProducts} old products and ${cleanupResults.deletedCategories} old categories, ` +
            `added ${syncResult.summary.newProducts + syncResult.summary.updatedProducts} new products and ${syncResult.summary.newCategories + syncResult.summary.updatedCategories} categories ` +
            `from categories: ${categoryNames.join(', ')}`,
        );
      } else {
        this.logger.warn(
          `Clean and sync completed with errors. ` +
            `Removed ${cleanupResults.deletedProducts} old products and ${cleanupResults.deletedCategories} old categories, ` +
            `added ${syncResult.summary.newProducts + syncResult.summary.updatedProducts} new products and ${syncResult.summary.newCategories + syncResult.summary.updatedCategories} categories, ` +
            `but ${syncResult.errors.length} errors occurred.`,
        );
      }

      return enhancedResult;
    } catch (error) {
      this.logger.error(`Clean and sync operation failed: ${error.message}`);
      throw new BadRequestException(`Clean and sync failed: ${error.message}`);
    }
  }

  // ===== KEEP ALL YOUR EXISTING METHODS UNCHANGED =====

  async search(params: {
    pageSize: number;
    pageNumber: number;
    title?: string;
    type?: string;
    categoryNames?: string[];
    categoryIds?: string[];
    productTypes?: string[]; // New parameter for product type filtering
  }) {
    const {
      pageSize,
      pageNumber,
      title,
      type,
      categoryNames,
      categoryIds,
      productTypes,
    } = params;

    const where: any = {};

    if (title) {
      where['title'] = { contains: title };
    }
    if (type) {
      where['type'] = type;
    }

    // Add product type filtering
    if (productTypes && productTypes.length > 0) {
      where['type'] = {
        in: productTypes,
      };
    }

    // Add category filtering
    if (categoryNames && categoryNames.length > 0) {
      // First, find category IDs by names
      const categories = await this.prisma.category.findMany({
        where: {
          name: {
            in: categoryNames,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (categories.length === 0) {
        this.logger.warn(
          `No categories found with names: ${categoryNames.join(', ')}`,
        );
        // Return empty result if no categories found
        return {
          content: [],
          totalElements: 0,
          availableTypes: [],
          pageable: {
            pageNumber,
            pageSize,
            pageCount: 0,
          },
        };
      }

      const foundCategoryIds = categories.map((cat) => cat.id);
      this.logger.log(
        `Found categories: ${categories.map((c) => `${c.name} (${c.id})`).join(', ')}`,
      );

      where['product_categories'] = {
        some: {
          categories_id: {
            in: foundCategoryIds,
          },
        },
      };
    } else if (categoryIds && categoryIds.length > 0) {
      // Filter by category IDs directly
      const bigIntCategoryIds = categoryIds.map((id) => BigInt(id));
      where['product_categories'] = {
        some: {
          categories_id: {
            in: bigIntCategoryIds,
          },
        },
      };
    }

    const totalElements = await this.prisma.product.count({ where });

    const products = await this.prisma.product.findMany({
      where,
      skip: pageNumber * pageSize,
      take: pageSize,
      orderBy: { id: 'desc' },
      include: {
        product_categories: {
          include: {
            category: true,
          },
        },
      },
    });

    // Get available types for the current filter
    const availableTypesQuery = { ...where };
    delete availableTypesQuery.type; // Remove type filter to get all available types

    const availableTypesResult = await this.prisma.product.findMany({
      where: availableTypesQuery,
      select: {
        type: true,
      },
      distinct: ['type'],
      orderBy: {
        type: 'asc',
      },
    });

    const availableTypes = availableTypesResult
      .map((item) => item.type)
      .filter((type) => type && type.trim() !== '')
      .sort();

    const content = products.map((product) => {
      let imagesUrl = [];
      try {
        imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
      } catch (error) {
        console.log(
          `Failed to parse images_url for product ${product.id}:`,
          error,
        );
      }

      return {
        ...product,
        id: product.id.toString(),
        price: product.price ? Number(product.price) : null,
        quantity: product.quantity ? Number(product.quantity) : null,
        imagesUrl,
        isFeatured: product.is_featured,
        type: product.type || 'Chưa phân loại', // Ensure type is always present
        ofCategories: product.product_categories.map((pc) => ({
          id: pc.categories_id.toString(),
          name: pc.category?.name || '',
        })),
      };
    });

    this.logger.log(
      `Search completed: ${content.length} products found with filters:`,
      {
        title,
        type,
        categoryNames,
        categoryIds,
        productTypes,
        totalElements,
        availableTypesCount: availableTypes.length,
      },
    );

    return {
      content,
      totalElements,
      availableTypes, // Include available types for frontend filtering
      pageable: {
        pageNumber,
        pageSize,
        pageCount: Math.ceil(totalElements / pageSize),
      },
    };
  }

  // Add method to get product types for specific categories
  async getProductTypesByCategories(categoryNames: string[]): Promise<{
    types: Array<{
      type: string;
      count: number;
      categoryName: string;
    }>;
    totalTypes: number;
  }> {
    if (!categoryNames || categoryNames.length === 0) {
      return { types: [], totalTypes: 0 };
    }

    // Find category IDs
    const categories = await this.prisma.category.findMany({
      where: {
        name: {
          in: categoryNames,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (categories.length === 0) {
      return { types: [], totalTypes: 0 };
    }

    const categoryIds = categories.map((cat) => cat.id);
    const categoryMap = categories.reduce((acc, cat) => {
      acc[cat.id.toString()] = cat.name;
      return acc;
    }, {});

    // Get products with their types for these categories
    const products = await this.prisma.product.findMany({
      where: {
        product_categories: {
          some: {
            categories_id: {
              in: categoryIds,
            },
          },
        },
      },
      select: {
        type: true,
        product_categories: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Count types by category
    const typeCountMap = new Map<
      string,
      { count: number; categoryName: string }
    >();

    products.forEach((product) => {
      const productType = product.type || 'Chưa phân loại';

      product.product_categories.forEach((pc) => {
        if (
          categoryIds.some((id) => id.toString() === pc.category.id.toString())
        ) {
          const key = `${productType}|${pc.category.name}`;
          const existing = typeCountMap.get(key);

          if (existing) {
            existing.count += 1;
          } else {
            typeCountMap.set(key, {
              count: 1,
              categoryName: pc.category.name,
            });
          }
        }
      });
    });

    const types = Array.from(typeCountMap.entries())
      .map(([key, value]) => {
        const [type] = key.split('|');
        return {
          type,
          count: value.count,
          categoryName: value.categoryName,
        };
      })
      .sort((a, b) => {
        // Sort by category name first, then by type name
        if (a.categoryName !== b.categoryName) {
          return a.categoryName.localeCompare(b.categoryName);
        }
        return a.type.localeCompare(b.type);
      });

    return {
      types,
      totalTypes: types.length,
    };
  }

  async findById(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: BigInt(id) },
      include: {
        product_categories: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    let imagesUrl = [];
    try {
      imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
    } catch (error) {
      console.log(
        `Failed to parse images_url for product ${product.id}:`,
        error,
      );
    }

    return {
      ...product,
      id: product.id.toString(),
      price: product.price ? Number(product.price) : null,
      quantity: product.quantity ? Number(product.quantity) : null,
      imagesUrl,
      generalDescription: product.general_description || '',
      ofCategories: product.product_categories.map((pc) => ({
        id: pc.categories_id.toString(),
        name: pc.category?.name || '',
      })),
    };
  }

  async create(createProductDto: CreateProductDto) {
    const {
      title,
      price,
      quantity,
      categoryIds,
      description,
      imagesUrl,
      generalDescription,
      instruction,
      isFeatured,
      featuredThumbnail,
      recipeThumbnail,
      type,
    } = createProductDto;

    const product = await this.prisma.product.create({
      data: {
        title,
        price: price ? BigInt(price) : null,
        quantity: BigInt(quantity),
        description,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : null,
        general_description: generalDescription,
        instruction,
        is_featured: isFeatured || false,
        featured_thumbnail: featuredThumbnail,
        recipe_thumbnail: recipeThumbnail,
        type,
        created_date: new Date(),
      },
    });

    if (categoryIds && categoryIds.length > 0) {
      for (const categoryId of categoryIds) {
        await this.prisma.product_categories.create({
          data: {
            product_id: product.id,
            categories_id: BigInt(categoryId),
          },
        });
      }
    }

    return this.findById(Number(product.id));
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    const productId = BigInt(id);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const {
      title,
      price,
      quantity,
      categoryIds,
      description,
      imagesUrl,
      generalDescription,
      instruction,
      isFeatured,
      featuredThumbnail,
      recipeThumbnail,
      type,
    } = updateProductDto;

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        title,
        price: price !== undefined ? BigInt(price) : product.price,
        quantity: quantity !== undefined ? BigInt(quantity) : product.quantity,
        description,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : product.images_url,
        general_description: generalDescription,
        instruction,
        is_featured: isFeatured,
        featured_thumbnail: featuredThumbnail,
        recipe_thumbnail: recipeThumbnail,
        type,
        updated_date: new Date(),
      },
    });

    if (categoryIds && categoryIds.length > 0) {
      await this.prisma.product_categories.deleteMany({
        where: { product_id: productId },
      });

      for (const categoryId of categoryIds) {
        await this.prisma.product_categories.create({
          data: {
            product_id: productId,
            categories_id: BigInt(categoryId),
          },
        });
      }
    }

    return this.findById(id);
  }

  async remove(id: number) {
    const productId = BigInt(id);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.prisma.product_categories.deleteMany({
      where: { product_id: productId },
    });

    await this.prisma.product.delete({
      where: { id: productId },
    });

    return { message: `Product with ID ${id} has been deleted` };
  }

  async searchOrders(params: OrderSearchDto) {
    const {
      pageSize = 10,
      pageNumber = 0,
      type,
      receiverFullName,
      email,
      phoneNumber,
      status,
      id,
    } = params;

    const where: any = {};

    if (id) {
      where.id = BigInt(id);
    }
    if (type) {
      where.type = type;
    }
    if (receiverFullName) {
      where.receiver_full_name = {
        contains: receiverFullName,
      };
    }
    if (email) {
      where.email = {
        contains: email,
      };
    }
    if (phoneNumber) {
      where.phone_number = {
        contains: phoneNumber,
      };
    }
    if (status) {
      where.status = status;
    }

    const totalElements = await this.prisma.product_order.count({
      where,
    });

    const orders = await this.prisma.product_order.findMany({
      where,
      include: {
        orders: {
          include: {
            product: true,
          },
        },
      },
      skip: Number(pageNumber) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { created_date: 'desc' },
    });

    const content = orders.map((order) => ({
      id: order.id.toString(),
      createdDate: order.created_date ? order.created_date.toISOString() : null,
      updatedDate: order.updated_date ? order.updated_date.toISOString() : null,
      addressDetail: order.address_detail,
      email: order.email,
      note: order.note,
      phoneNumber: order.phone_number,
      price: order.price ? Number(order.price) : null,
      quantity: order.quantity,
      receiverFullName: order.receiver_full_name,
      status: order.status,
      type: order.type,
      orders: order.orders.map((item) => ({
        id: item.id.toString(),
        quantity: item.quantity,
        product: item.product
          ? {
              id: item.product.id.toString(),
              title: item.product.title,
              price: item.product.price ? Number(item.product.price) : null,
            }
          : null,
      })),
    }));

    return {
      content,
      totalElements,
      pageable: {
        pageNumber: Number(pageNumber),
        pageSize: Number(pageSize),
      },
    };
  }

  async changeOrderStatus(id: string, status: string) {
    const orderId = BigInt(id);

    const order = await this.prisma.product_order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    await this.prisma.product_order.update({
      where: { id: orderId },
      data: {
        status,
        updated_date: new Date(),
      },
    });

    return { message: `Order status updated to ${status}` };
  }

  async getProductsByIds(productIds: string) {
    const ids = productIds.split(',').map((id) => BigInt(id));

    if (!ids.length) {
      return [];
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      include: {
        product_categories: {
          include: {
            category: true,
          },
        },
      },
    });

    return products.map((product) => {
      let imagesUrl = [];
      try {
        imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
      } catch (error) {
        console.log(
          `Failed to parse images_url for product ${product.id}:`,
          error,
        );
      }

      return {
        ...product,
        id: product.id.toString(),
        price: product.price ? Number(product.price) : null,
        quantity: product.quantity ? Number(product.quantity) : null,
        imagesUrl,
        isFeatured: product.is_featured,
        ofCategories: product.product_categories.map((pc) => ({
          id: pc.categories_id.toString(),
          name: pc.category?.name || '',
        })),
      };
    });
  }

  async getAllCategories(): Promise<
    Array<{
      id: string;
      name: string;
      parentId: string | null;
      parentName: string | null;
    }>
  > {
    const categories = await this.prisma.category.findMany({
      where: {
        name: {
          not: null, // Only get categories with non-null names
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get parent names
    const parentIds = categories
      .filter((cat) => cat.parent_id !== null)
      .map((cat) => cat.parent_id!);

    let parentMap: Record<string, string> = {};
    if (parentIds.length > 0) {
      const parentCategories = await this.prisma.category.findMany({
        where: {
          id: {
            in: parentIds,
          },
          name: {
            not: null, // Only get parent categories with non-null names
          },
        },
        select: {
          id: true,
          name: true,
        },
      });
      parentMap = parentCategories.reduce(
        (acc, parent) => {
          if (parent.name) {
            // Additional null check
            acc[parent.id.toString()] = parent.name;
          }
          return acc;
        },
        {} as Record<string, string>,
      );
    }

    return categories
      .filter((category) => category.name) // Filter out any categories with null names
      .map((category) => {
        const parentId = category.parent_id
          ? category.parent_id.toString()
          : null;
        return {
          id: category.id.toString(),
          name: category.name!, // Use non-null assertion since we filtered out nulls
          parentId: parentId,
          parentName: parentId ? parentMap[parentId] || null : null,
        };
      });
  }
}
