import { Injectable, Logger } from '@nestjs/common';
import { KiotvietService } from '../kiotviet/kiotviet.service';
import { PrismaClient } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProductSyncService {
  private readonly logger = new Logger(ProductSyncService.name);
  private prisma = new PrismaClient();

  // Define allowed category IDs
  private readonly allowedCategoryIds = ['2205374', '2205381']; // Trà Phượng Hoàng, Lermao

  constructor(
    private readonly kiotVietService: KiotvietService,
    private readonly configService: ConfigService,
  ) {
    // Get allowed categories from config
    const allowedCategoriesStr = this.configService.get(
      'KIOTVIET_ALLOWED_CATEGORIES',
    );
    this.allowedCategoryIds = allowedCategoriesStr
      ? allowedCategoriesStr.split(',')
      : [];
  }

  async syncAllProducts() {
    this.logger.log('Starting full product sync...');

    let pageIndex = 0;
    const pageSize = 100;
    let hasMoreData = true;
    let totalProductsProcessed = 0;
    let totalProductsFiltered = 0;
    let totalProductsSynced = 0;

    const initialSyncDate = '2024-12-22T00:00:00';

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
        const { processed, filtered, synced } = await (
          this.processProducts as any
        )(data.data);

        // Update counters
        totalProductsProcessed += data.data.length;
        totalProductsFiltered += filtered;
        totalProductsSynced += synced;

        this.logger.log(
          `Batch stats - Processed: ${data.data.length}, Filtered: ${filtered}, Synced: ${synced}`,
        );
        this.logger.log(
          `Running totals - Processed: ${totalProductsProcessed}, Filtered: ${totalProductsFiltered}, Synced: ${totalProductsSynced}`,
        );

        // Increment page index for next batch
        pageIndex++;

        // Check if we've reached the end of available products
        // This is calculated based on total products reported by KiotViet
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

  @Cron('0 1 * * *')
  async incrementalSync() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0] + 'T00:00:00';

    this.logger.log(`Starting incremental sync from ${dateStr}`);

    let pageIndex = 0;
    const pageSize = 100;
    let hasMoreData = true;
    let totalProductsProcessed = 0;
    let totalProductsFiltered = 0;

    while (hasMoreData) {
      try {
        const data = await this.kiotVietService.getProducts(
          pageSize,
          pageIndex,
          dateStr,
        );

        if (!data.data || data.data.length === 0) {
          hasMoreData = false;
          break;
        }

        const beforeCount = await this.getLocalProductCount();
        await this.processProducts(data.data);
        const afterCount = await this.getLocalProductCount();

        // Update counters
        totalProductsProcessed += data.data.length;
        totalProductsFiltered += data.data.length - (afterCount - beforeCount);

        this.logger.log(
          `Incrementally processed ${totalProductsProcessed} products, filtered out ${totalProductsFiltered} products`,
        );

        pageIndex++;

        if (data.total <= pageSize * pageIndex) {
          hasMoreData = false;
        }
      } catch (error) {
        this.logger.error(
          `Error in incremental sync on page ${pageIndex}`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    this.logger.log(
      `Incremental sync completed. Total processed: ${totalProductsProcessed}, filtered out: ${totalProductsFiltered}`,
    );
  }

  private async processProducts(
    products: any[],
  ): Promise<{ processed: number; filtered: number; synced: number }> {
    let filtered = 0;
    let synced = 0;

    for (const kiotVietProduct of products) {
      try {
        // Check if product belongs to allowed categories
        const categoryId = kiotVietProduct.categoryId?.toString();
        if (!categoryId || !this.allowedCategoryIds.includes(categoryId)) {
          this.logger.debug(
            `Skipping product ${kiotVietProduct.id} (${kiotVietProduct.name}) - category ${categoryId} not in allowed list`,
          );
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
                  name: kiotVietProduct.categoryName,
                  kiotviet_id: kiotVietProduct.categoryId.toString(),
                  created_date: new Date(),
                },
              });
              this.logger.log(
                `Created new category ${kiotVietProduct.categoryName}`,
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
          `Error processing product ${kiotVietProduct.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    return { processed: products.length, filtered, synced };
  }
}
