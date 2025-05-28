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
      };
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

  private async syncProductCategoryRelationships(
    productId: bigint,
    kiotVietCategoryId?: number,
  ): Promise<void> {
    try {
      if (!kiotVietCategoryId) {
        this.logger.debug(`No category ID provided for product ${productId}`);
        return;
      }

      // Check if the category exists in our local database
      const categoryExists = await this.prisma.category.findUnique({
        where: { id: BigInt(kiotVietCategoryId) },
      });

      if (!categoryExists) {
        this.logger.warn(
          `Category ${kiotVietCategoryId} not found in local database for product ${productId}`,
        );
        return;
      }

      // Check if relationship already exists
      const existingRelation = await this.prisma.product_categories.findFirst({
        where: {
          product_id: productId,
          categories_id: BigInt(kiotVietCategoryId),
        },
      });

      if (!existingRelation) {
        // Create the relationship
        await this.prisma.product_categories.create({
          data: {
            product_id: productId,
            categories_id: BigInt(kiotVietCategoryId),
          },
        });
        this.logger.debug(
          `Created category relationship: product ${productId} -> category ${kiotVietCategoryId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync category relationship for product ${productId}: ${error.message}`,
      );
      // Don't throw error here, just log it so it doesn't break the entire sync
    }
  }

  async syncProductsFromKiotVietEnhanced(
    lastModifiedFrom?: string,
    categoryNames?: string[],
  ): Promise<SyncResult> {
    this.logger.log('Starting enhanced product synchronization from KiotViet');

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

                // Check if product exists
                let existingProduct: any = null;
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
                  // Update existing product
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
                  }
                } else {
                  // Create new product
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
                  }
                }

                // Sync category relationships (outside of transaction for performance)
                // We'll do this after the transaction completes
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

      // Step 3: Sync category relationships after main transaction
      this.logger.log('Syncing product-category relationships...');
      let relationshipsSynced = 0;

      for (const kiotVietProduct of fetchResult.products) {
        if (kiotVietProduct.categoryId) {
          try {
            await this.syncProductCategoryRelationships(
              BigInt(kiotVietProduct.id),
              kiotVietProduct.categoryId,
            );
            relationshipsSynced++;
          } catch (relationError) {
            this.logger.warn(
              `Failed to sync category relationship for product ${kiotVietProduct.id}: ${relationError.message}`,
            );
          }
        }
      }

      this.logger.log(
        `Synced ${relationshipsSynced} product-category relationships`,
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
        },
        batchInfo: fetchResult.batchInfo,
      };

      if (result.success) {
        this.logger.log(
          'Enhanced product synchronization completed successfully',
          {
            totalSynced: result.totalSynced,
            totalDeleted: result.totalDeleted,
            relationshipsSynced,
            filteredCategories: fetchResult.filteredCategories,
          },
        );
      } else {
        this.logger.warn(
          'Enhanced product synchronization completed with errors',
          {
            totalSynced: result.totalSynced,
            totalDeleted: result.totalDeleted,
            relationshipsSynced,
            errorCount: result.errors.length,
            filteredCategories: fetchResult.filteredCategories,
          },
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        'Enhanced product synchronization failed with critical error:',
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
        },
        batchInfo: [],
      };
    }
  }

  /**
   * FIXED: Enhanced synchronization with robust error handling and proper transaction management
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

      // FIXED: Process the synchronization with improved transaction handling
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
                // FIXED: Delete associated records first to avoid foreign key constraints
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

                // FIXED: Check if product exists with proper error handling
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
                  }
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

            // FIXED: Add small delay between batches to prevent overwhelming the database
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
          isolationLevel: 'Serializable', // FIXED: Use stronger isolation level for data consistency
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
        },
        batchInfo: [],
      };
    }
  }

  async forceFullSync(categoryNames?: string[]): Promise<SyncResult> {
    if (categoryNames && categoryNames.length > 0) {
      this.logger.log(
        `Starting force full sync for categories: ${categoryNames.join(', ')}`,
      );
    } else {
      this.logger.log(
        'Starting force full sync - this will replace all products',
      );
    }

    try {
      const beforeCount = await this.prisma.product.count();
      this.logger.log(`Current product count before sync: ${beforeCount}`);

      const syncResult = await this.syncProductsFromKiotViet(
        undefined,
        categoryNames,
      );

      if (syncResult.success) {
        if (categoryNames) {
          this.logger.log(
            `Force sync for categories [${categoryNames.join(', ')}] completed successfully. ` +
              `Products: ${beforeCount} → ${syncResult.summary.afterSync} (${syncResult.totalSynced} synced)`,
          );
        } else {
          this.logger.log(
            `Force full sync completed successfully. Products: ${beforeCount} → ${syncResult.summary.afterSync}`,
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

    const result = await this.syncProductsFromKiotViet(
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

  private async updateLastSyncTimestamp(): Promise<void> {
    this.logger.log(`Last sync completed at: ${new Date().toISOString()}`);
  }

  async cleanAndSyncCategories(categoryNames: string[]): Promise<
    SyncResult & {
      cleanupInfo: {
        deletedProducts: number;
        deletedOrders: number;
        deletedReviews: number;
        deletedRelations: number;
      };
    }
  > {
    if (!categoryNames || categoryNames.length === 0) {
      throw new BadRequestException('At least one category name is required');
    }

    try {
      const beforeCleanupCount = await this.prisma.product.count();

      const beforeOrdersCount = await this.prisma.orders.count();
      const beforeReviewsCount = await this.prisma.review.count();
      const beforeRelationsCount = await this.prisma.product_categories.count();

      // Clear all products and related data from database
      const cleanupResults = await this.prisma.$transaction(async (prisma) => {
        this.logger.log('Starting database cleanup transaction...');

        const deletedOrders = await prisma.orders.deleteMany({});

        const deletedReviews = await prisma.review.deleteMany({});

        const deletedRelations = await prisma.product_categories.deleteMany({});

        const deletedProducts = await prisma.product.deleteMany({});

        return {
          deletedProducts: deletedProducts.count,
          deletedOrders: deletedOrders.count,
          deletedReviews: deletedReviews.count,
          deletedRelations: deletedRelations.count,
        };
      });

      // Verify database is clean
      const afterCleanupCount = await this.prisma.product.count();
      if (afterCleanupCount !== 0) {
        throw new Error(
          `Database cleanup failed: ${afterCleanupCount} products still remain`,
        );
      }
      const syncResult = await this.syncProductsFromKiotViet(
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
            `Removed ${cleanupResults.deletedProducts} old products (and ${cleanupResults.deletedOrders} orders, ${cleanupResults.deletedReviews} reviews), ` +
            `added ${syncResult.totalSynced} new products from categories: ${categoryNames.join(', ')}`,
        );
      } else {
        this.logger.warn(
          `Clean and sync completed with errors. ` +
            `Removed ${cleanupResults.deletedProducts} old products, added ${syncResult.totalSynced} new products, but ${syncResult.errors.length} errors occurred.`,
        );
      }

      return enhancedResult;
    } catch (error) {
      this.logger.error(`Clean and sync operation failed: ${error.message}`);
      throw new BadRequestException(`Clean and sync failed: ${error.message}`);
    }
  }

  async search(params: {
    pageSize: number;
    pageNumber: number;
    title?: string;
    type?: string;
  }) {
    const { pageSize, pageNumber, title, type } = params;

    const where = {};
    if (title) {
      where['title'] = { contains: title };
    }
    if (type) {
      where['type'] = type;
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
        ofCategories: product.product_categories.map((pc) => ({
          id: pc.categories_id.toString(),
          name: pc.category?.name || '',
        })),
      };
    });

    return {
      content,
      totalElements,
      pageable: {
        pageNumber,
        pageSize,
        pageCount: Math.ceil(totalElements / pageSize),
      },
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

  // async getProductsBySpecificCategories(params: {
  //   pageSize: number;
  //   pageNumber: number;
  //   title?: string;
  //   categoryIds: bigint[];
  //   allowedTypes: string[];
  // }) {
  //   const { pageSize, pageNumber, title } = params;

  //   // Category IDs for "Trà Phượng Hoàng" and "Lermao" from your database
  //   const categoryIds = [
  //     BigInt(1), // Trà phượng hoàng
  //     BigInt(2), // Gấu Lermao
  //     BigInt(2205374), // Trà Phượng Hoàng
  //     BigInt(2205381), // Lermao
  //   ];

  //   // Allowed product types
  //   const allowedTypes = [
  //     'Bột',
  //     'Mứt Sốt',
  //     'Siro',
  //     'Topping',
  //     'Khác (Lermao)',
  //     'Khác (Trà Phượng Hoàng)',
  //     'Gói',
  //     'Chai',
  //     'Cái',
  //     'Hộp',
  //     'Túi',
  //     'piece',
  //   ];

  //   try {
  //     const productCategoryRelations =
  //       await this.prisma.product_categories.findMany({
  //         where: {
  //           categories_id: {
  //             in: categoryIds,
  //           },
  //         },
  //         select: {
  //           product_id: true,
  //         },
  //       });

  //     const productIds = [
  //       ...new Set(productCategoryRelations.map((rel) => rel.product_id)),
  //     ];

  //     if (productIds.length === 0) {
  //       this.logger.log('No products found for specified categories');
  //       return {
  //         content: [],
  //         totalElements: 0,
  //         pageable: {
  //           pageNumber,
  //           pageSize,
  //         },
  //       };
  //     }

  //     const where: any = {
  //       id: {
  //         in: productIds,
  //       },
  //     };

  //     const whereWithType: any = {
  //       ...where,
  //       type: {
  //         in: allowedTypes,
  //       },
  //     };

  //     if (title) {
  //       where.title = { contains: title };
  //       whereWithType.title = { contains: title };
  //     }

  //     // Try to get count with type filter first
  //     let totalElements = await this.prisma.product.count({
  //       where: whereWithType,
  //     });
  //     let useTypeFilter = true;

  //     if (totalElements === 0) {
  //       totalElements = await this.prisma.product.count({ where });
  //       useTypeFilter = false;
  //       this.logger.log(
  //         'No products found with type filter, showing all products from categories',
  //       );
  //     }

  //     const products = await this.prisma.product.findMany({
  //       where: useTypeFilter ? whereWithType : where,
  //       skip: pageNumber * pageSize,
  //       take: pageSize,
  //       orderBy: { created_date: 'desc' },
  //       include: {
  //         product_categories: {
  //           include: {
  //             category: true,
  //           },
  //         },
  //       },
  //     });

  //     const content = products.map((product) => {
  //       let imagesUrl = [];
  //       try {
  //         imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
  //       } catch (error) {
  //         this.logger.warn(
  //           `Failed to parse images_url for product ${product.id}:`,
  //           error,
  //         );
  //       }

  //       return {
  //         id: product.id.toString(),
  //         title: product.title,
  //         price: product.price ? Number(product.price) : null,
  //         quantity: product.quantity ? Number(product.quantity) : null,
  //         description: product.description,
  //         imagesUrl,
  //         generalDescription: product.general_description || '',
  //         instruction: product.instruction || '',
  //         isFeatured: product.is_featured || false,
  //         featuredThumbnail: product.featured_thumbnail,
  //         recipeThumbnail: product.recipe_thumbnail,
  //         type: product.type,
  //         createdDate: product.created_date,
  //         updatedDate: product.updated_date,
  //         ofCategories: product.product_categories.map((pc) => ({
  //           id: pc.categories_id.toString(),
  //           name: pc.category?.name || '',
  //         })),
  //       };
  //     });

  //     return {
  //       content,
  //       totalElements,
  //       pageable: {
  //         pageNumber,
  //         pageSize,
  //       },
  //     };
  //   } catch (error) {
  //     this.logger.error('Error in getProductsBySpecificCategories:', error);
  //     throw error;
  //   }
  // }

  async getProductsBySpecificCategories(params: {
    pageSize: number;
    pageNumber: number;
    title?: string;
  }) {
    const { pageSize, pageNumber, title } = params;

    try {
      this.logger.log(
        'Fetching products from Lermao and Trà Phượng Hoàng categories including all children',
      );

      // Define the target parent category IDs
      const targetParentIds = [2205381, 2205374]; // Lermao and Trà Phượng Hoàng

      // Use KiotViet service to find all descendant category IDs
      const allCategoryIds =
        await this.kiotVietService.findDescendantCategoryIds(targetParentIds);

      this.logger.log(
        `Found ${allCategoryIds.length} category IDs including children: ${allCategoryIds.slice(0, 10).join(', ')}${allCategoryIds.length > 10 ? '...' : ''}`,
      );

      // Convert to BigInt for database query
      const categoryIdsBigInt = allCategoryIds.map((id) => BigInt(id));

      // Get all product IDs that belong to any of these categories
      const productCategoryRelations =
        await this.prisma.product_categories.findMany({
          where: {
            categories_id: {
              in: categoryIdsBigInt,
            },
          },
          select: {
            product_id: true,
          },
        });

      const productIds = [
        ...new Set(productCategoryRelations.map((rel) => rel.product_id)),
      ];

      if (productIds.length === 0) {
        this.logger.log('No products found for specified category hierarchy');
        return {
          content: [],
          totalElements: 0,
          pageable: {
            pageNumber,
            pageSize,
          },
          categoryInfo: {
            targetParentIds,
            allCategoryIds,
            totalCategoriesSearched: allCategoryIds.length,
          },
        };
      }

      // Build where clause for products
      const where: any = {
        id: {
          in: productIds,
        },
      };

      if (title) {
        where.title = { contains: title };
      }

      const totalElements = await this.prisma.product.count({ where });

      const products = await this.prisma.product.findMany({
        where,
        skip: pageNumber * pageSize,
        take: pageSize,
        orderBy: { created_date: 'desc' },
        include: {
          product_categories: {
            include: {
              category: true,
            },
          },
        },
      });

      const content = products.map((product) => {
        let imagesUrl = [];
        try {
          imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
        } catch (error) {
          this.logger.warn(
            `Failed to parse images_url for product ${product.id}:`,
            error,
          );
        }

        return {
          id: product.id.toString(),
          title: product.title,
          price: product.price ? Number(product.price) : null,
          quantity: product.quantity ? Number(product.quantity) : null,
          description: product.description,
          imagesUrl,
          generalDescription: product.general_description || '',
          instruction: product.instruction || '',
          isFeatured: product.is_featured || false,
          featuredThumbnail: product.featured_thumbnail,
          recipeThumbnail: product.recipe_thumbnail,
          type: product.type,
          createdDate: product.created_date,
          updatedDate: product.updated_date,
          ofCategories: product.product_categories.map((pc) => ({
            id: pc.categories_id.toString(),
            name: pc.category?.name || '',
          })),
        };
      });

      this.logger.log(
        `Successfully found ${totalElements} products from hierarchical category search`,
      );

      return {
        content,
        totalElements,
        pageable: {
          pageNumber,
          pageSize,
        },
        categoryInfo: {
          targetParentIds,
          allCategoryIds,
          totalCategoriesSearched: allCategoryIds.length,
          productsFoundInCategories: productIds.length,
        },
      };
    } catch (error) {
      this.logger.error('Error in getProductsBySpecificCategories:', error);
      throw new BadRequestException(
        `Failed to get products by categories: ${error.message}`,
      );
    }
  }

  /**
   * NEW: Enhanced fetchAllProducts with better hierarchical category filtering
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
    const maxEmptyBatches = 3; // Stop after 3 consecutive empty batches

    while (hasMoreData && consecutiveEmptyBatches < maxEmptyBatches) {
      this.logger.debug(
        `Fetching batch ${batchNumber} for category ${categoryId} (items ${currentItem}-${
          currentItem + batchSize - 1
        })`,
      );

      try {
        const batch = await this.kiotVietService['fetchProductBatch'](
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
          consecutiveEmptyBatches = 0; // Reset counter on successful batch
        }

        if (batch.data.length < batchSize) {
          hasMoreData = false;
        } else {
          currentItem += batchSize;
          batchNumber++;
        }

        // Add delay between batches to be nice to the API
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(
          `Error fetching batch ${batchNumber} for category ${categoryId}: ${error.message}`,
        );

        // If it's a rate limit or temporary error, wait longer and retry
        if (
          error.message.includes('rate limit') ||
          error.response?.status === 429
        ) {
          this.logger.warn(
            `Rate limit hit for category ${categoryId}, waiting 60 seconds...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 60000));
          continue; // Retry the same batch
        }

        // For other errors, log and continue to next category
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

  async fetchAllProductsWithHierarchicalFilter(
    parentCategoryIds: number[],
    lastModifiedFrom?: string,
  ): Promise<{
    products: KiotVietProduct[];
    deletedIds: number[];
    totalFetched: number;
    batchInfo: Array<{
      batchNumber: number;
      itemsFetched: number;
      currentItem: number;
    }>;
    categoryInfo: {
      parentIds: number[];
      allDescendantIds: number[];
      totalCategoriesSearched: number;
    };
  }> {
    this.logger.log(
      `Starting hierarchical product fetch for parent categories: ${parentCategoryIds.join(', ')}`,
    );

    try {
      // Get all descendant category IDs
      const allDescendantIds =
        await this.kiotVietService.findDescendantCategoryIds(parentCategoryIds);

      this.logger.log(
        `Found ${allDescendantIds.length} total category IDs (including parents and children) for product filtering`,
      );

      const allProducts: KiotVietProduct[] = [];
      const allDeletedIds: number[] = [];
      const batchInfo: Array<{
        batchNumber: number;
        itemsFetched: number;
        currentItem: number;
      }> = [];

      // Fetch products for each category
      for (let i = 0; i < allDescendantIds.length; i++) {
        const categoryId = allDescendantIds[i];

        this.logger.log(
          `Fetching products for category ID: ${categoryId} (${i + 1}/${allDescendantIds.length})`,
        );

        try {
          const categoryResult = await this.fetchProductsForCategory(
            categoryId,
            lastModifiedFrom,
          );

          this.logger.log(
            `Category ID ${categoryId}: Found ${categoryResult.products.length} products`,
          );

          allProducts.push(...categoryResult.products);
          allDeletedIds.push(...categoryResult.deletedIds);

          categoryResult.batchInfo.forEach((batch) => {
            batchInfo.push({
              ...batch,
              batchNumber: batchInfo.length + 1,
            });
          });
        } catch (categoryError) {
          this.logger.warn(
            `Failed to fetch products for category ${categoryId}: ${categoryError.message}`,
          );
          // Continue with other categories
        }

        // Small delay to be nice to the API
        if (i < allDescendantIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
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
        `Hierarchical product fetch complete: ${uniqueProducts.length} unique products from ${allDescendantIds.length} categories`,
      );

      return {
        products: uniqueProducts,
        deletedIds: [...new Set(allDeletedIds)],
        totalFetched: uniqueProducts.length,
        batchInfo,
        categoryInfo: {
          parentIds: parentCategoryIds,
          allDescendantIds,
          totalCategoriesSearched: allDescendantIds.length,
        },
      };
    } catch (error) {
      this.logger.error(
        'Failed to fetch products with hierarchical filter:',
        error.message,
      );
      throw error;
    }
  }

  /**
   * NEW: Sync products specifically from Lermao and Trà Phượng Hoàng hierarchy
   */
  async syncProductsFromTargetCategories(lastModifiedFrom?: string): Promise<
    SyncResult & {
      categoryInfo: {
        parentIds: number[];
        allDescendantIds: number[];
        totalCategoriesSearched: number;
      };
    }
  > {
    this.logger.log(
      'Starting targeted product sync from Lermao and Trà Phượng Hoàng categories',
    );

    const targetParentIds = [2205381, 2205374]; // Lermao and Trà Phượng Hoàng

    try {
      // Use the new hierarchical fetch method
      const fetchResult = await this.fetchAllProductsWithHierarchicalFilter(
        targetParentIds,
        lastModifiedFrom,
      );

      this.logger.log(
        `Fetched ${fetchResult.products.length} products from target category hierarchy`,
      );

      // Use existing sync logic but with the hierarchical fetch result
      const errors: string[] = [];
      let totalSynced = 0;
      let totalDeleted = 0;

      const beforeSyncCount = await this.prisma.product.count();
      this.logger.log(`Current products in database: ${beforeSyncCount}`);

      // Process the synchronization with improved transaction handling
      const syncResults = await this.prisma.$transaction(
        async (transactionClient) => {
          let newProducts = 0;
          let updatedProducts = 0;

          // Handle deleted products
          if (fetchResult.deletedIds && fetchResult.deletedIds.length > 0) {
            this.logger.log(
              `Processing ${fetchResult.deletedIds.length} deleted products`,
            );

            try {
              const validDeletedIds = fetchResult.deletedIds
                .filter((id) => typeof id === 'number' && !isNaN(id) && id > 0)
                .map((id) => BigInt(id));

              if (validDeletedIds.length > 0) {
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

          // Process products in batches
          const batchSize = 20;
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

                const productData =
                  this.mapKiotVietProductToLocal(kiotVietProduct);
                if (!productData || typeof productData !== 'object') {
                  errors.push(
                    `Product ${kiotVietProduct.id}: Failed to map product data`,
                  );
                  continue;
                }

                let existingProduct: any = null;
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
                  try {
                    await transactionClient.product.update({
                      where: { id: BigInt(kiotVietProduct.id) },
                      data: {
                        ...productData,
                        updated_date: new Date(),
                      },
                    });
                    updatedProducts++;
                  } catch (updateError) {
                    const errorMsg = `Failed to update product ${kiotVietProduct.id}: ${updateError.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                  }
                } else {
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
                  } catch (createError) {
                    const errorMsg = `Failed to create product ${kiotVietProduct.id}: ${createError.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                  }
                }
              } catch (productError) {
                const errorMsg = `Failed to process product ${kiotVietProduct?.id || 'unknown'}: ${productError.message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);
              }
            }

            if (batchNumber < totalBatches) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }

          totalSynced = newProducts + updatedProducts;
          return { newProducts, updatedProducts };
        },
        {
          timeout: 900000, // 15 minute timeout
          isolationLevel: 'Serializable',
        },
      );

      const afterSyncCount = await this.prisma.product.count();

      const result = {
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
        },
        batchInfo: fetchResult.batchInfo,
        categoryInfo: fetchResult.categoryInfo,
      };

      if (result.success) {
        this.logger.log(
          'Targeted category product synchronization completed successfully',
          {
            totalSynced: result.totalSynced,
            categoryInfo: result.categoryInfo,
          },
        );
      } else {
        this.logger.warn(
          'Targeted category product synchronization completed with errors',
          {
            totalSynced: result.totalSynced,
            errorCount: result.errors.length,
            categoryInfo: result.categoryInfo,
          },
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        'Targeted category product synchronization failed:',
        error.message,
      );
      throw new BadRequestException(
        `Targeted category sync failed: ${error.message}`,
      );
    }
  }
}
