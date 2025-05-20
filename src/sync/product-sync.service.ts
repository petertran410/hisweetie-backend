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
    this.logger.log('Starting filtered product sync...');

    let pageIndex = 0;
    const pageSize = 100;
    let hasMoreData = true;
    let totalProductsProcessed = 0;
    let totalProductsFiltered = 0;

    const initialSyncDate = '2024-12-22T00:00:00';

    while (hasMoreData) {
      try {
        const data = await this.kiotVietService.getProducts(
          pageSize,
          pageIndex,
          initialSyncDate,
        );

        if (!data.data || data.data.length === 0) {
          hasMoreData = false;
          break;
        }

        // Count total products before filtering
        const beforeCount = totalProductsProcessed;

        // Process products (with filtering)
        await this.processProducts(data.data);

        // Update counters
        totalProductsProcessed += data.data.length;
        totalProductsFiltered =
          totalProductsProcessed - (await this.getLocalProductCount());

        this.logger.log(
          `Processed ${totalProductsProcessed} products, filtered out ${totalProductsFiltered} products`,
        );

        pageIndex++;

        if (data.total <= pageSize * pageIndex) {
          hasMoreData = false;
        }
      } catch (error) {
        this.logger.error(`Error syncing products on page ${pageIndex}`, error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    this.logger.log(
      `Product sync completed. Total processed: ${totalProductsProcessed}, filtered out: ${totalProductsFiltered}`,
    );
    return {
      success: true,
      totalProductsProcessed,
      totalProductsFiltered,
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

  private async processProducts(products: any[]) {
    for (const kiotVietProduct of products) {
      try {
        // Check if product belongs to allowed categories
        const categoryId = kiotVietProduct.categoryId?.toString();
        if (!categoryId || !this.allowedCategoryIds.includes(categoryId)) {
          this.logger.debug(
            `Skipping product ${kiotVietProduct.id} (${kiotVietProduct.name}) - category ${categoryId} not in allowed list`,
          );
          continue; // Skip this product
        }

        this.logger.debug(
          `Processing product ${kiotVietProduct.id} (${kiotVietProduct.name}) from allowed category ${categoryId}`,
        );

        const existingProduct = await this.prisma.product.findFirst({
          where: { kiotviet_id: kiotVietProduct.id.toString() },
        });

        const inventoryQuantity =
          await this.kiotVietService.getProductInventory(
            kiotVietProduct.id.toString(),
          );

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
        } else {
          // Create new product
          const newProduct = await this.prisma.product.create({
            data: {
              ...productData,
              created_date: new Date(),
            },
          });

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
            }

            // Associate product with category
            await this.prisma.product_categories.create({
              data: {
                product_id: newProduct.id,
                categories_id: category.id,
              },
            });
          }
        }
      } catch (error) {
        this.logger.error(
          `Error processing product ${kiotVietProduct.id}`,
          error,
        );
      }
    }
  }
}
