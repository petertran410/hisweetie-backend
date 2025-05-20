import { Injectable, Logger } from '@nestjs/common';
import { KiotvietService } from '../kiotviet/kiotviet.service';
import { PrismaClient } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProductSyncService {
  private readonly logger = new Logger(ProductSyncService.name);
  private prisma = new PrismaClient();
  private allowedCategoryIds: string[] = [];

  constructor(
    private readonly kiotVietService: KiotvietService,
    private readonly configService: ConfigService,
  ) {
    // Get allowed categories from config or use default values
    const allowedCategoriesStr = this.configService.get(
      'KIOTVIET_ALLOWED_CATEGORIES',
    );
    this.allowedCategoryIds = allowedCategoriesStr
      ? allowedCategoriesStr.split(',')
      : ['2205374', '2205381']; // Set defaults if not in config

    this.logger.log(
      `Allowed category IDs: ${this.allowedCategoryIds.join(', ')}`,
    );
  }

  async syncAllProducts() {
    this.logger.log('Starting full product sync...');

    let pageIndex = 0;
    const pageSize = 100;
    let hasMoreData = true;
    let totalProductsProcessed = 0;
    let totalProductsFiltered = 0;
    let totalProductsSynced = 0;

    const initialSyncDate = '2024-12-21T00:00:00';

    while (hasMoreData) {
      try {
        this.logger.log(
          `Fetching products batch: page ${pageIndex + 1}, size ${pageSize}`,
        );

        const data = await this.kiotVietService.getProducts(
          pageSize,
          pageIndex,
          initialSyncDate,
        );

        this.logger.log(
          `Received batch with ${data.data?.length || 0} products. Total products: ${data.total}`,
        );

        if (!data.data || data.data.length === 0) {
          this.logger.log('No more products in response, ending sync');
          hasMoreData = false;
          break;
        }

        // Process the current batch of products
        const result = await this.processProducts(data.data);

        // Update counters
        totalProductsProcessed += data.data.length;
        totalProductsFiltered += result.filtered;
        totalProductsSynced += result.synced;

        this.logger.log(
          `Batch stats - Processed: ${data.data.length}, Filtered: ${result.filtered}, Synced: ${result.synced}`,
        );
        this.logger.log(
          `Running totals - Processed: ${totalProductsProcessed}, Filtered: ${totalProductsFiltered}, Synced: ${totalProductsSynced}`,
        );

        // Increment page index for next batch
        pageIndex++;

        // Check if we've reached the end of available products
        if (pageSize * pageIndex >= data.total) {
          this.logger.log(
            `Reached the end of available products (${data.total})`,
          );
          hasMoreData = false;
        }

        // Add a small delay to avoid hitting rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error(`Error syncing products on page ${pageIndex}`, error);
        // Wait a bit longer after an error
        await new Promise((resolve) => setTimeout(resolve, 5000));
        // Continue with next page even after an error
      }
    }

    this.logger.log(
      `Product sync completed. Total processed: ${totalProductsProcessed}, ` +
        `filtered out: ${totalProductsFiltered}, successfully synced: ${totalProductsSynced}`,
    );

    return {
      success: true,
      totalProductsProcessed,
      totalProductsFiltered,
      totalProductsSynced,
    };
  }

  // Helper method to get current product count
  private async getLocalProductCount(): Promise<number> {
    return await this.prisma.product.count({
      where: {
        kiotviet_id: {
          not: null,
        },
      },
    });
  }

  async incrementalSync() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0] + 'T00:00:00';

    this.logger.log(`Starting incremental sync from ${dateStr}`);
    this.logger.log(
      `Using allowed categories: ${this.allowedCategoryIds.join(', ')}`,
    );

    let pageIndex = 0;
    const pageSize = 100;
    let hasMoreData = true;
    let totalProductsProcessed = 0;
    let totalProductsFiltered = 0;
    let totalProductsSynced = 0;

    while (hasMoreData) {
      try {
        this.logger.log(`Fetching page ${pageIndex}, size ${pageSize}`);
        const data = await this.kiotVietService.getProducts(
          pageSize,
          pageIndex,
          dateStr,
        );

        if (!data.data || data.data.length === 0) {
          this.logger.log('No more products in response, ending sync');
          hasMoreData = false;
          break;
        }

        // Log a sample of the first product to understand the structure
        if (pageIndex === 0 && data.data.length > 0) {
          this.logger.log(
            `Sample product data: ${JSON.stringify(data.data[0])}`,
          );
        }

        const result = await this.processProducts(data.data);

        // Update counters
        totalProductsProcessed += data.data.length;
        totalProductsFiltered += result.filtered;
        totalProductsSynced += result.synced;

        this.logger.log(
          `Incrementally processed ${totalProductsProcessed} products, filtered out ${totalProductsFiltered}, synced ${totalProductsSynced}`,
        );

        pageIndex++;

        if (data.total <= pageSize * pageIndex) {
          hasMoreData = false;
        }

        // Add a small delay
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error(
          `Error in incremental sync on page ${pageIndex}`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    this.logger.log(
      `Incremental sync completed. Total processed: ${totalProductsProcessed}, filtered out: ${totalProductsFiltered}, synced: ${totalProductsSynced}`,
    );

    return {
      success: true,
      totalProductsProcessed,
      totalProductsFiltered,
      totalProductsSynced,
    };
  }

  private async processProducts(
    products: any[],
  ): Promise<{ processed: number; filtered: number; synced: number }> {
    let filtered = 0;
    let synced = 0;

    // Log how many products we received for processing
    this.logger.log(`Processing ${products.length} products from KiotViet`);

    for (const kiotVietProduct of products) {
      try {
        // Extract category ID, converting to string if needed
        const categoryId = kiotVietProduct.categoryId?.toString();

        // Detailed debug for the first few products of each batch
        const isAllowed = this.allowedCategoryIds.includes(categoryId);

        this.logger.debug(
          `Product: ${kiotVietProduct.id} (${kiotVietProduct.name})
           - CategoryId: ${categoryId} (type: ${typeof kiotVietProduct.categoryId})
           - Allowed CategoryIds: ${this.allowedCategoryIds.join(', ')}
           - Is Allowed: ${isAllowed}`,
        );

        if (!categoryId || !isAllowed) {
          filtered++;
          continue; // Skip this product
        }

        this.logger.log(
          `Processing product from allowed category: ${kiotVietProduct.id} (${kiotVietProduct.name}) - category ${categoryId}`,
        );

        const existingProduct = await this.prisma.product.findFirst({
          where: { kiotviet_id: kiotVietProduct.id.toString() },
        });

        // Get inventory information
        let inventoryQuantity = 0;
        try {
          inventoryQuantity = await this.kiotVietService.getProductInventory(
            kiotVietProduct.id.toString(),
          );
        } catch (inventoryError) {
          this.logger.error(
            `Error fetching inventory for product ${kiotVietProduct.id}. Using default value 0.`,
            inventoryError,
          );
        }

        const imageUrls = kiotVietProduct.images || [];

        const productData = {
          title: kiotVietProduct.name,
          price: kiotVietProduct.basePrice
            ? BigInt(Math.round(kiotVietProduct.basePrice))
            : BigInt(0),
          quantity: BigInt(inventoryQuantity),
          description: kiotVietProduct.description || '',
          general_description: `${kiotVietProduct.fullName || ''} - ${kiotVietProduct.code || ''}`,
          images_url: JSON.stringify(imageUrls),
          is_featured: kiotVietProduct.isActive === true,
          type: 'SAN_PHAM',
          kiotviet_id: kiotVietProduct.id.toString(),
          updated_date: new Date(),
        };

        if (existingProduct) {
          // Update existing product
          await this.prisma.product.update({
            where: { id: existingProduct.id },
            data: productData,
          });
          this.logger.log(`Updated existing product ${kiotVietProduct.id}`);
        } else {
          // Create new product
          const newProduct = await this.prisma.product.create({
            data: {
              ...productData,
              created_date: new Date(),
            },
          });
          this.logger.log(`Created new product ${kiotVietProduct.id}`);

          // Category handling
          if (kiotVietProduct.categoryId) {
            let category = await this.prisma.category.findFirst({
              where: { kiotviet_id: kiotVietProduct.categoryId.toString() },
            });

            if (!category) {
              // Create category if it doesn't exist
              category = await this.prisma.category.create({
                data: {
                  name: kiotVietProduct.categoryName || 'Unknown Category',
                  kiotviet_id: kiotVietProduct.categoryId.toString(),
                  created_date: new Date(),
                },
              });
              this.logger.log(
                `Created new category ${kiotVietProduct.categoryName || 'Unknown Category'}`,
              );
            }

            // Associate product with category
            await this.prisma.product_categories.create({
              data: {
                product_id: newProduct.id,
                categories_id: category.id,
              },
            });
            this.logger.log(
              `Associated product ${kiotVietProduct.id} with category ${category.id}`,
            );
          }
        }

        // Count successful syncs
        synced++;
      } catch (error) {
        this.logger.error(
          `Error processing product ${kiotVietProduct?.id || 'unknown'}: ${error.message}`,
          error.stack,
        );
      }
    }

    this.logger.log(
      `Processed ${products.length} products: filtered ${filtered}, synced ${synced}`,
    );
    return { processed: products.length, filtered, synced };
  }

  getAllowedCategoryIds(): string[] {
    return this.allowedCategoryIds;
  }

  async syncProductsByCategory() {
    let totalProductsSynced = 0;

    for (const categoryId of this.allowedCategoryIds) {
      this.logger.log(`Syncing products for category ${categoryId}`);

      try {
        const productsData =
          await this.kiotVietService.getProductsByCategory(categoryId);
        if (productsData.data && productsData.data.length > 0) {
          const result = await this.processProducts(productsData.data);
          totalProductsSynced += result.synced;
        }
      } catch (error) {
        this.logger.error(`Error syncing category ${categoryId}`, error);
      }
    }

    return { success: true, totalProductsSynced };
  }
}
