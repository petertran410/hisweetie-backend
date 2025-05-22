import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaClient } from '@prisma/client';
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
  images?: Array<{ Image: string }>;
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
   * This function handles all the edge cases that could cause "Invalid array length" errors
   */
  private safeBigIntConversion(
    value: any,
    fieldName: string,
    productId?: number,
  ): bigint {
    try {
      // Log the incoming value for debugging
      this.logger.debug(
        `Converting ${fieldName} for product ${productId}: ${JSON.stringify(value)} (type: ${typeof value})`,
      );

      // Handle null, undefined, or empty values
      if (value === null || value === undefined || value === '') {
        this.logger.debug(`${fieldName} is null/undefined/empty, returning 0`);
        return BigInt(0);
      }

      // Handle string values that might be numbers
      if (typeof value === 'string') {
        // Remove any non-numeric characters except decimal point
        const cleanValue = value.replace(/[^\d.-]/g, '');
        if (cleanValue === '' || cleanValue === '-') {
          this.logger.debug(
            `${fieldName} string cleaned to empty, returning 0`,
          );
          return BigInt(0);
        }
        value = parseFloat(cleanValue);
      }

      // Convert to number if not already
      const numericValue = Number(value);

      // Validate the numeric conversion
      if (isNaN(numericValue) || !isFinite(numericValue)) {
        this.logger.warn(
          `${fieldName} for product ${productId} is NaN or infinite: ${value}, returning 0`,
        );
        return BigInt(0);
      }

      // Ensure positive values only
      const positiveValue = Math.max(0, numericValue);

      // Ensure integer values (floor the number)
      const integerValue = Math.floor(positiveValue);

      // Check if the value is within safe integer range
      if (integerValue > Number.MAX_SAFE_INTEGER) {
        this.logger.warn(
          `${fieldName} for product ${productId} exceeds max safe integer: ${integerValue}, capping to max safe integer`,
        );
        return BigInt(Number.MAX_SAFE_INTEGER);
      }

      const result = BigInt(integerValue);
      this.logger.debug(
        `Successfully converted ${fieldName} for product ${productId}: ${result}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Error converting ${fieldName} for product ${productId}: ${error.message}, returning 0`,
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

      // Validate array structure if it's an array
      if (Array.isArray(data)) {
        // Filter out invalid entries
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
   * Enhanced product mapping with individual field error handling
   * Each field conversion is wrapped in its own try-catch to isolate issues
   */
  private mapKiotVietProductToLocal(kiotVietProduct: KiotVietProduct): any {
    const productId = kiotVietProduct.id;
    this.logger.debug(`Mapping product ${productId}: ${kiotVietProduct.name}`);

    try {
      let result = {};

      // Handle title with fallback chain
      try {
        result['title'] = this.sanitizeString(
          kiotVietProduct.name ||
            kiotVietProduct.fullName ||
            `Product ${productId}`,
        );
      } catch (error) {
        this.logger.error(
          `Error processing title for product ${productId}: ${error.message}`,
        );
        result['title'] = `Product ${productId}`;
      }

      // Handle price conversion
      try {
        result['price'] = this.safeBigIntConversion(
          kiotVietProduct.basePrice,
          'price',
          productId,
        );
      } catch (error) {
        this.logger.error(
          `Error processing price for product ${productId}: ${error.message}`,
        );
        result['price'] = BigInt(0);
      }

      // Handle quantity conversion with inventory data
      try {
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
        result['quantity'] = this.safeBigIntConversion(
          quantityValue,
          'quantity',
          productId,
        );
      } catch (error) {
        this.logger.error(
          `Error processing quantity for product ${productId}: ${error.message}`,
        );
        result['quantity'] = BigInt(1);
      }

      // Handle images array
      try {
        let imageUrls = [''];
        if (kiotVietProduct.images && Array.isArray(kiotVietProduct.images)) {
          imageUrls = kiotVietProduct.images
            .filter((img) => img && img.Image && typeof img.Image === 'string')
            .map((img) => img.Image.trim())
            .filter((url) => url.length > 0);
        }
        result['images_url'] = this.safeJsonStringify(
          imageUrls,
          'images',
          productId,
        );
        result['featured_thumbnail'] =
          imageUrls.length > 0 ? imageUrls[0] : null;
      } catch (error) {
        this.logger.error(
          `Error processing images for product ${productId}: ${error.message}`,
        );
        result['images_url'] = null;
        result['featured_thumbnail'] = null;
      }

      // Handle text fields with safe sanitization
      try {
        result['description'] = this.sanitizeString(
          kiotVietProduct.description || '',
        );
        result['general_description'] = this.sanitizeString(
          kiotVietProduct.fullName || kiotVietProduct.name || '',
        );
        result['type'] = this.sanitizeString(kiotVietProduct.unit || 'piece');
        result['kiotviet_id'] = this.sanitizeString(
          kiotVietProduct.code || productId.toString(),
        );
      } catch (error) {
        this.logger.error(
          `Error processing text fields for product ${productId}: ${error.message}`,
        );
        result['description'] = '';
        result['general_description'] = '';
        result['type'] = 'piece';
        result['kiotviet_id'] = productId.toString();
      }

      // Set default values for remaining fields
      result['instruction'] = '';
      result['is_featured'] = false;
      result['recipe_thumbnail'] = null;

      this.logger.debug(`Successfully mapped product ${productId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Critical error mapping product ${productId}: ${error.message}`,
      );
      // Return a minimal safe object
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
        kiotviet_id: productId.toString(),
      };
    }
  }

  /**
   * Enhanced string sanitization with comprehensive validation
   */
  private sanitizeString(value: any): string {
    try {
      // Handle non-string inputs
      if (value === null || value === undefined) {
        return '';
      }

      // Convert to string if not already
      let stringValue = String(value);

      // Remove problematic characters that could cause database issues
      stringValue = stringValue
        .replace(/\0/g, '') // Remove null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
        .trim();

      // Limit length to prevent database overflow
      if (stringValue.length > 1000) {
        stringValue = stringValue.substring(0, 1000);
        this.logger.warn(
          `String truncated to 1000 characters: ${stringValue.substring(0, 50)}...`,
        );
      }

      return stringValue;
    } catch (error) {
      this.logger.error(`Error sanitizing string: ${error.message}`);
      return '';
    }
  }

  /**
   * Enhanced synchronization with granular error handling and progress tracking
   */
  async syncProductsFromKiotViet(
    lastModifiedFrom?: string,
  ): Promise<SyncResult> {
    this.logger.log('Starting product synchronization from KiotViet');

    const errors: string[] = [];
    let totalSynced = 0;
    let totalDeleted = 0;

    try {
      // Get current product count before sync
      const beforeSyncCount = await this.prisma.product.count();
      this.logger.log(`Current products in database: ${beforeSyncCount}`);

      // Fetch all products from KiotViet with detailed logging
      this.logger.log('Fetching products from KiotViet...');
      const fetchResult =
        await this.kiotVietService.fetchAllProducts(lastModifiedFrom);
      this.logger.log(
        `Fetched ${fetchResult.products.length} products from KiotViet`,
      );

      // Validate the fetched data structure
      if (!Array.isArray(fetchResult.products)) {
        throw new Error(
          `Invalid products data structure: expected array, got ${typeof fetchResult.products}`,
        );
      }

      // Log some sample data for debugging
      if (fetchResult.products.length > 0) {
        this.logger.debug(
          `Sample product data: ${JSON.stringify(fetchResult.products[0], null, 2)}`,
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

      // Process the synchronization in a database transaction
      const syncResults = await this.prisma.$transaction(
        async (prisma) => {
          let newProducts = 0;
          let updatedProducts = 0;

          // Step 1: Handle deleted products with enhanced validation
          if (fetchResult.deletedIds && fetchResult.deletedIds.length > 0) {
            this.logger.log(
              `Processing ${fetchResult.deletedIds.length} deleted products`,
            );

            try {
              // Validate deleted IDs array
              const validDeletedIds = fetchResult.deletedIds
                .filter((id) => {
                  if (typeof id !== 'number' || isNaN(id) || id <= 0) {
                    this.logger.warn(`Invalid deleted product ID: ${id}`);
                    return false;
                  }
                  return true;
                })
                .map((id) => {
                  try {
                    return BigInt(id);
                  } catch (error) {
                    this.logger.error(
                      `Error converting deleted ID ${id} to BigInt: ${error.message}`,
                    );
                    return null;
                  }
                })
                .filter((id) => id !== null);

              if (validDeletedIds.length > 0) {
                this.logger.log(
                  `Deleting ${validDeletedIds.length} valid product IDs`,
                );
                const deleteResult = await prisma.product.deleteMany({
                  where: {
                    id: {
                      in: validDeletedIds,
                    },
                  },
                });

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

          // Step 2: Process products in smaller batches with individual error handling
          const batchSize = 25; // Smaller batches for better error isolation
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

            for (let j = 0; j < batch.length; j++) {
              const kiotVietProduct = batch[j];
              const productIndex = i + j + 1;

              try {
                // Validate essential product fields
                if (!kiotVietProduct || typeof kiotVietProduct !== 'object') {
                  errors.push(
                    `Product ${productIndex}: Invalid product object`,
                  );
                  continue;
                }

                if (
                  !kiotVietProduct.id ||
                  typeof kiotVietProduct.id !== 'number'
                ) {
                  errors.push(
                    `Product ${productIndex}: Invalid or missing product ID: ${kiotVietProduct.id}`,
                  );
                  continue;
                }

                this.logger.debug(
                  `Processing product ${productIndex}/${totalProducts}: ID ${kiotVietProduct.id}`,
                );

                // Map the product data with detailed error handling
                const productData =
                  this.mapKiotVietProductToLocal(kiotVietProduct);

                // Validate the mapped data before database operation
                if (!productData || typeof productData !== 'object') {
                  errors.push(
                    `Product ${kiotVietProduct.id}: Failed to map product data`,
                  );
                  continue;
                }

                // Check if product exists in database
                const existingProduct = await prisma.product.findUnique({
                  where: { id: BigInt(kiotVietProduct.id) },
                });

                if (existingProduct) {
                  // Update existing product
                  await prisma.product.update({
                    where: { id: BigInt(kiotVietProduct.id) },
                    data: {
                      ...productData,
                      updated_date: new Date(),
                    },
                  });
                  updatedProducts++;
                  this.logger.debug(`Updated product ${kiotVietProduct.id}`);
                } else {
                  // Create new product
                  await prisma.product.create({
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
                    `Created new product ${kiotVietProduct.id}`,
                  );
                }
              } catch (error) {
                const errorMsg = `Failed to sync product ${kiotVietProduct?.id || 'unknown'} (${kiotVietProduct?.name || 'unnamed'}): ${error.message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);

                // Log the full error stack for debugging
                this.logger.debug(
                  `Full error stack for product ${kiotVietProduct?.id}: ${error.stack}`,
                );
              }
            }

            // Progress update
            this.logger.log(
              `Completed batch ${batchNumber}/${totalBatches}. Progress: ${Math.round(((i + batch.length) / totalProducts) * 100)}%`,
            );
          }

          totalSynced = newProducts + updatedProducts;
          this.logger.log(
            `Sync summary: ${newProducts} new, ${updatedProducts} updated, ${totalSynced} total synced`,
          );

          return {
            newProducts,
            updatedProducts,
          };
        },
        {
          timeout: 600000, // 10 minute timeout for very large syncs
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
        });
      } else {
        this.logger.warn('Product synchronization completed with errors', {
          totalSynced: result.totalSynced,
          totalDeleted: result.totalDeleted,
          errorCount: result.errors.length,
          firstFewErrors: result.errors.slice(0, 3),
        });
      }

      return result;
    } catch (error) {
      this.logger.error(
        'Product synchronization failed with critical error:',
        error.message,
      );
      this.logger.debug('Full error stack:', error.stack);

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
   * Force sync all products with enhanced error reporting
   */
  async forceFullSync(): Promise<SyncResult> {
    this.logger.log(
      'Starting force full sync - this will replace all products',
    );

    try {
      const beforeCount = await this.prisma.product.count();
      this.logger.log(`Current product count before sync: ${beforeCount}`);

      const syncResult = await this.syncProductsFromKiotViet();

      if (syncResult.success) {
        this.logger.log(
          `Force full sync completed successfully. Products: ${beforeCount} → ${syncResult.summary.afterSync}`,
        );
      } else {
        this.logger.error('Force full sync completed with errors:');
        syncResult.errors.forEach((error, index) => {
          this.logger.error(`Error ${index + 1}: ${error}`);
        });
      }

      return syncResult;
    } catch (error) {
      this.logger.error('Force full sync failed:', error.message);
      throw new BadRequestException(`Force sync failed: ${error.message}`);
    }
  }

  /**
   * Incremental sync with enhanced logging
   */
  async incrementalSync(since?: string): Promise<SyncResult> {
    const lastModifiedFrom = since || (await this.getLastSyncTimestamp());
    this.logger.log(`Starting incremental sync since: ${lastModifiedFrom}`);

    const result = await this.syncProductsFromKiotViet(lastModifiedFrom);

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

  // All your existing methods remain the same below...
  // [Rest of your existing methods: search, findById, create, update, remove, searchOrders, changeOrderStatus, getProductsByIds]

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
