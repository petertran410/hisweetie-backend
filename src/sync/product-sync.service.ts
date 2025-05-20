// src/sync/product-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { KiotvietService } from '../kiotviet/kiotviet.service';
import { PrismaClient } from '@prisma/client';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class ProductSyncService {
  private readonly logger = new Logger(ProductSyncService.name);
  private prisma = new PrismaClient();

  constructor(private readonly kiotVietService: KiotvietService) {}

  // Full sync - can be triggered manually or scheduled
  async syncAllProducts() {
    this.logger.log('Starting full product sync...');

    let pageIndex = 0;
    const pageSize = 100;
    let hasMoreData = true;
    let totalProductsProcessed = 0;

    // Initial date for first sync (your starting date)
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

        // Process each product
        await this.processProducts(data.data);

        totalProductsProcessed += data.data.length;
        this.logger.log(`Processed ${totalProductsProcessed} products so far`);

        // Move to next page
        pageIndex++;

        // Check if we've reached the end
        if (data.total <= pageSize * pageIndex) {
          hasMoreData = false;
        }
      } catch (error) {
        this.logger.error(`Error syncing products on page ${pageIndex}`, error);
        // Wait a bit before retrying to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    this.logger.log(
      `Product sync completed. Total processed: ${totalProductsProcessed}`,
    );
    return { success: true, totalProductsProcessed };
  }

  // Daily incremental sync - run every night at 1 AM
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

        await this.processProducts(data.data);

        totalProductsProcessed += data.data.length;
        this.logger.log(
          `Incrementally processed ${totalProductsProcessed} products`,
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
      `Incremental sync completed. Total updated: ${totalProductsProcessed}`,
    );
  }

  private async processProducts(products: any[]) {
    for (const kiotVietProduct of products) {
      try {
        const existingProduct = await this.prisma.product.findFirst({
          where: { kiotviet_id: kiotVietProduct.id.toString() },
        });

        const inventoryQuantity =
          await this.kiotVietService.getProductInventory(
            kiotVietProduct.id.toString(),
          );

        // Extract images if available
        const imageUrls = kiotVietProduct.images || [];

        // Prepare product data
        const productData = {
          title: kiotVietProduct.name,
          price: kiotVietProduct.basePrice
            ? BigInt(Math.round(kiotVietProduct.basePrice))
            : BigInt(0),
          // Since quantity isn't in this response, we'll need another API call or endpoint
          // I'll set a placeholder value for now
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

          // Handle category association
          if (kiotVietProduct.categoryId) {
            // Find or create category
            let category = await this.prisma.category.findFirst({
              where: { kiotviet_id: kiotVietProduct.categoryId.toString() },
            });

            if (!category) {
              // Category doesn't exist yet, create it
              category = await this.prisma.category.create({
                data: {
                  name: kiotVietProduct.categoryName,
                  kiotviet_id: kiotVietProduct.categoryId.toString(),
                  created_date: new Date(),
                },
              });
            }

            // Create product-category relationship
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
