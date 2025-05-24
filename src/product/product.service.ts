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
   * Map KiotViet product to local database structure
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

  /**
   * Force sync with category filtering
   */
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

  /**
   * Incremental sync with category filtering
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

  /**
   * Update the last sync timestamp
   */
  private async updateLastSyncTimestamp(): Promise<void> {
    this.logger.log(`Last sync completed at: ${new Date().toISOString()}`);
  }

  /**
   * Clean database and sync only specific categories
   */
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
    this.logger.log(
      `Starting clean database and category sync for: ${categoryNames.join(', ')}`,
    );

    if (!categoryNames || categoryNames.length === 0) {
      throw new BadRequestException('At least one category name is required');
    }

    try {
      const beforeCleanupCount = await this.prisma.product.count();
      this.logger.log(
        `Current products in database before cleanup: ${beforeCleanupCount}`,
      );

      const beforeOrdersCount = await this.prisma.orders.count();
      const beforeReviewsCount = await this.prisma.review.count();
      const beforeRelationsCount = await this.prisma.product_categories.count();

      this.logger.log(
        `Related data before cleanup: ${beforeOrdersCount} orders, ${beforeReviewsCount} reviews, ${beforeRelationsCount} category relations`,
      );

      // Clear all products and related data from database
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
      this.logger.log(
        'Database successfully cleaned - no products or related data remain',
      );

      // Perform fresh sync with only specified categories
      this.logger.log(
        `Now syncing fresh data for categories: ${categoryNames.join(', ')}`,
      );
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

  // Include all your existing methods here (search, findById, create, update, remove, etc.)
  // ... (keeping all existing methods unchanged)

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
}
