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
   * Synchronize all products from KiotViet to local database
   * This method orchestrates the entire sync process, including data validation and error handling
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

      // Fetch all products from KiotViet (credentials are handled internally)
      const fetchResult =
        await this.kiotVietService.fetchAllProducts(lastModifiedFrom);

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

      // Begin database transaction for atomic sync
      const syncResults = await this.prisma.$transaction(async (prisma) => {
        let newProducts = 0;
        let updatedProducts = 0;

        // Step 1: Handle deleted products first
        if (fetchResult.deletedIds.length > 0) {
          this.logger.log(
            `Processing ${fetchResult.deletedIds.length} deleted products`,
          );

          const deleteResult = await prisma.product.deleteMany({
            where: {
              id: {
                in: fetchResult.deletedIds.map((id) => BigInt(id)),
              },
            },
          });

          totalDeleted = deleteResult.count;
          this.logger.log(
            `Deleted ${totalDeleted} products from local database`,
          );
        }

        // Step 2: Process products in batches to avoid memory issues
        const batchSize = 50; // Process products in smaller batches for database operations
        const totalProducts = fetchResult.products.length;

        for (let i = 0; i < totalProducts; i += batchSize) {
          const batch = fetchResult.products.slice(i, i + batchSize);
          this.logger.debug(
            `Processing product batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalProducts / batchSize)}`,
          );

          for (const kiotVietProduct of batch) {
            try {
              const productData =
                this.mapKiotVietProductToLocal(kiotVietProduct);

              // Check if product exists
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
              }
            } catch (error) {
              const errorMsg = `Failed to sync product ${kiotVietProduct.id} (${kiotVietProduct.name}): ${error.message}`;
              this.logger.error(errorMsg);
              errors.push(errorMsg);
            }
          }
        }

        totalSynced = newProducts + updatedProducts;

        return {
          newProducts,
          updatedProducts,
        };
      });

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

      this.logger.log('Product synchronization completed', {
        success: result.success,
        totalSynced: result.totalSynced,
        totalDeleted: result.totalDeleted,
        errorCount: result.errors.length,
      });

      return result;
    } catch (error) {
      this.logger.error('Product synchronization failed:', error.message);

      return {
        success: false,
        totalSynced: 0,
        totalDeleted: 0,
        errors: [error.message],
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
   * Map KiotViet product structure to local database structure
   * This handles the transformation between different data schemas
   */
  private mapKiotVietProductToLocal(kiotVietProduct: KiotVietProduct): any {
    // Extract image URLs from KiotViet format
    const imageUrls = kiotVietProduct.images
      ? kiotVietProduct.images.map((img) => img.Image).filter((url) => url)
      : [];

    return {
      title:
        kiotVietProduct.name || kiotVietProduct.fullName || 'Unnamed Product',
      price: kiotVietProduct.basePrice
        ? BigInt(Math.floor(kiotVietProduct.basePrice))
        : BigInt(0),
      quantity: BigInt(1), // Default quantity, may need to be fetched from inventory API
      description: kiotVietProduct.description || '',
      images_url: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
      general_description: kiotVietProduct.fullName || '',
      instruction: '', // KiotViet doesn't provide this field
      is_featured: false, // Default value
      featured_thumbnail: imageUrls.length > 0 ? imageUrls[0] : null,
      recipe_thumbnail: null, // Not available in KiotViet
      type: kiotVietProduct.unit || 'piece',
      kiotviet_id: kiotVietProduct.code || kiotVietProduct.id.toString(),
    };
  }

  /**
   * Force sync all products (replaces entire product catalog)
   * This method performs a complete replacement of the local product catalog
   */
  async forceFullSync(): Promise<SyncResult> {
    this.logger.log(
      'Starting force full sync - this will replace all products',
    );

    try {
      // Step 1: Get current count for reporting
      const beforeCount = await this.prisma.product.count();

      // Step 2: Perform sync (without lastModifiedFrom to get all products)
      const syncResult = await this.syncProductsFromKiotViet();

      if (syncResult.success) {
        this.logger.log(
          `Force full sync completed successfully. Replaced ${beforeCount} products with ${syncResult.totalSynced} products from KiotViet`,
        );
      } else {
        this.logger.error(
          'Force full sync completed with errors',
          syncResult.errors,
        );
      }

      return syncResult;
    } catch (error) {
      this.logger.error('Force full sync failed:', error.message);
      throw new BadRequestException(`Force sync failed: ${error.message}`);
    }
  }

  /**
   * Incremental sync - only sync products modified since last sync
   * This is more efficient for regular updates
   */
  async incrementalSync(since?: string): Promise<SyncResult> {
    const lastModifiedFrom = since || (await this.getLastSyncTimestamp());
    this.logger.log(`Starting incremental sync since: ${lastModifiedFrom}`);

    const result = await this.syncProductsFromKiotViet(lastModifiedFrom);

    if (result.success) {
      // Update last sync timestamp
      await this.updateLastSyncTimestamp();
    }

    return result;
  }

  /**
   * Get the timestamp of the last successful sync
   */
  private async getLastSyncTimestamp(): Promise<string> {
    // You might want to store this in a separate config table
    // For now, we'll use the most recent product's updated_date
    try {
      const latestProduct = await this.prisma.product.findFirst({
        orderBy: { updated_date: 'desc' },
        select: { updated_date: true },
      });

      return (
        latestProduct?.updated_date?.toISOString() ||
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      ); // Default to 24 hours ago
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
    // In a production system, you'd want to store this in a dedicated config table
    // For now, we'll just log it
    this.logger.log(`Last sync completed at: ${new Date().toISOString()}`);
  }

  // Your existing methods remain unchanged
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
        imagesUrl,
        isFeatured: product.is_featured,
        ofCategories: product.product_categories.map((pc) => ({
          id: pc.categories_id,
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
      where: { id },
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
      imagesUrl,
      generalDescription: product.general_description || '',
      ofCategories: product.product_categories.map((pc) => ({
        id: pc.categories_id,
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
        price: price || null,
        quantity: quantity,
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
            product_id: BigInt(product.id),
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
      where: { id: BigInt(id) },
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
      where: { id: BigInt(id) },
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
      where: {
        id,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.prisma.product_categories.deleteMany({
      where: {
        product_id: product.id,
      },
    });

    await this.prisma.product.delete({
      where: {
        id: productId,
      },
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

    // Build where conditions
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

    // Get total count for pagination
    const totalElements = await this.prisma.product_order.count({
      where,
    });

    // Get orders with related data
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

    // Check if order exists
    const order = await this.prisma.product_order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    // Update order status
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
        imagesUrl,
        isFeatured: product.is_featured,
        ofCategories: product.product_categories.map((pc) => ({
          id: pc.categories_id,
          name: pc.category?.name || '',
        })),
      };
    });
  }
}
