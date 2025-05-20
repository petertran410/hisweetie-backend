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
    const allowedCategoriesStr = this.configService.get<string>(
      'KIOTVIET_ALLOWED_CATEGORIES',
    );
    this.allowedCategoryIds = allowedCategoriesStr
      ? allowedCategoriesStr.split(',')
      : ['2205374', '2205381']; // Default to Trà Phượng Hoàng and Lermao

    this.logger.log(
      `Allowed category IDs: ${this.allowedCategoryIds.join(', ')}`,
    );
  }

  async syncAllProducts() {
    this.logger.log('Starting full product sync...');

    let totalProductsProcessed = 0;
    let totalProductsFiltered = 0;
    let totalProductsSynced = 0;

    // First, ensure we have the categories in our database
    await this.syncCategories();

    // Then sync products from each allowed category directly
    for (const categoryId of this.allowedCategoryIds) {
      let pageIndex = 0;
      const pageSize = 100;
      let hasMoreProducts = true;

      while (hasMoreProducts) {
        try {
          this.logger.log(
            `Fetching products for category ${categoryId}, page ${pageIndex + 1}`,
          );

          // Get products directly from the category
          const result = await this.kiotVietService.getProductsByCategory(
            categoryId,
            pageSize,
            pageIndex,
          );

          if (!result.data || result.data.length === 0) {
            this.logger.log(`No more products for category ${categoryId}`);
            hasMoreProducts = false;
            break;
          }

          // Process this batch of products
          const batchResult = await this.processProducts(
            result.data,
            categoryId,
          );

          // Update counters
          totalProductsProcessed += result.data.length;
          totalProductsFiltered += batchResult.filtered;
          totalProductsSynced += batchResult.synced;

          this.logger.log(
            `Category ${categoryId} - batch processed: ${result.data.length}, ` +
              `filtered: ${batchResult.filtered}, synced: ${batchResult.synced}`,
          );

          // Go to next page
          pageIndex++;

          // Check if we've reached the end
          if (result.data.length < pageSize) {
            hasMoreProducts = false;
          }

          // Add a small delay to avoid rate limits
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          this.logger.error(
            `Error syncing category ${categoryId} on page ${pageIndex}`,
            error,
          );
          // Wait a bit longer after an error
          await new Promise((resolve) => setTimeout(resolve, 3000));
          // Try the next page
          pageIndex++;
        }
      }
    }

    this.logger.log(
      `Full sync completed. Total processed: ${totalProductsProcessed}, ` +
        `filtered: ${totalProductsFiltered}, synced: ${totalProductsSynced}`,
    );

    return {
      success: true,
      totalProductsProcessed,
      totalProductsFiltered,
      totalProductsSynced,
    };
  }

  async incrementalSync() {
    this.logger.log('Starting incremental product sync...');

    // Use yesterday's date as the starting point for incremental sync
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0] + 'T00:00:00';

    let pageIndex = 0;
    const pageSize = 100;
    let hasMoreData = true;
    let totalProductsProcessed = 0;
    let totalProductsFiltered = 0;
    let totalProductsSynced = 0;

    // Ensure we have up-to-date category data
    await this.syncCategories();

    while (hasMoreData) {
      try {
        this.logger.log(
          `Fetching page ${pageIndex}, size ${pageSize}, date ${dateStr}`,
        );

        // Get recently modified products
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

        // Log sample data for debugging
        if (pageIndex === 0 && data.data.length > 0) {
          const sampleProduct = data.data[0];
          this.logger.log(
            `Sample product: ID=${sampleProduct.id}, Name=${sampleProduct.name}, ` +
              `CategoryID=${sampleProduct.categoryId}, CategoryName=${sampleProduct.categoryName}`,
          );
        }

        // Process this batch of products
        const result = await this.processProducts(data.data);

        // Update counters
        totalProductsProcessed += data.data.length;
        totalProductsFiltered += result.filtered;
        totalProductsSynced += result.synced;

        this.logger.log(
          `Incrementally processed ${data.data.length} products, ` +
            `filtered: ${result.filtered}, synced: ${result.synced}`,
        );

        // Go to next page
        pageIndex++;

        // Check if we've reached the end
        if (data.total <= pageSize * pageIndex) {
          hasMoreData = false;
        }

        // Add a small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error(
          `Error in incremental sync on page ${pageIndex}`,
          error,
        );
        // Wait a bit longer after an error
        await new Promise((resolve) => setTimeout(resolve, 3000));
        // Move to next page
        pageIndex++;
      }
    }

    this.logger.log(
      `Incremental sync completed. Total processed: ${totalProductsProcessed}, ` +
        `filtered: ${totalProductsFiltered}, synced: ${totalProductsSynced}`,
    );

    return {
      success: true,
      totalProductsProcessed,
      totalProductsFiltered,
      totalProductsSynced,
    };
  }

  private async syncCategories() {
    this.logger.log('Syncing categories from KiotViet...');

    try {
      // Get categories from KiotViet
      const categories = await this.kiotVietService.getCategories();

      if (!categories || !categories.data) {
        this.logger.error(
          'Failed to fetch categories or no categories returned',
        );
        return;
      }

      this.logger.log(`Fetched ${categories.data.length} categories`);

      // Process each category
      for (const categoryData of categories.data) {
        const categoryId = categoryData.categoryId.toString();

        // Only process allowed categories
        if (this.allowedCategoryIds.includes(categoryId)) {
          this.logger.log(
            `Processing allowed category: ${categoryId} (${categoryData.categoryName})`,
          );

          // Check if category exists in our database
          let category = await this.prisma.category.findFirst({
            where: { kiotviet_id: categoryId },
          });

          if (!category) {
            // Create the category if it doesn't exist
            category = await this.prisma.category.create({
              data: {
                name: categoryData.categoryName,
                kiotviet_id: categoryId,
                created_date: new Date(),
              },
            });
            this.logger.log(
              `Created new category: ${categoryData.categoryName} (${categoryId})`,
            );
          } else {
            // Update the category name if it changed
            if (category.name !== categoryData.categoryName) {
              await this.prisma.category.update({
                where: { id: category.id },
                data: {
                  name: categoryData.categoryName,
                  updated_date: new Date(),
                },
              });
              this.logger.log(
                `Updated category: ${categoryData.categoryName} (${categoryId})`,
              );
            }
          }
        }
      }

      this.logger.log('Category sync completed');
    } catch (error) {
      this.logger.error('Error syncing categories', error);
    }
  }

  private async processProducts(
    products: any[],
    forceCategoryId?: string,
  ): Promise<{ processed: number; filtered: number; synced: number }> {
    let filtered = 0;
    let synced = 0;

    for (const kiotVietProduct of products) {
      try {
        // Get the product's category ID (or use the forced one if provided)
        const categoryId =
          forceCategoryId || kiotVietProduct.categoryId?.toString();

        // Skip products not in allowed categories
        if (!this.allowedCategoryIds.includes(categoryId)) {
          filtered++;
          continue;
        }

        this.logger.log(
          `Processing product ${kiotVietProduct.id} (${kiotVietProduct.name}) from category ${categoryId}`,
        );

        // Check if this product already exists in our database
        const existingProduct = await this.prisma.product.findFirst({
          where: { kiotviet_id: kiotVietProduct.id.toString() },
        });

        // Get inventory information
        let inventoryQuantity = 0;
        try {
          const inventoryData = await this.kiotVietService.getProductInventory(
            kiotVietProduct.id.toString(),
          );
          inventoryQuantity = inventoryData; // Use actual inventory data
        } catch (inventoryError) {
          this.logger.error(
            `Error fetching inventory for product ${kiotVietProduct.id}. Using default value 0.`,
            inventoryError,
          );
        }

        // Prepare the product data
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

          // Get the category entity from the database
          const category = await this.prisma.category.findFirst({
            where: { kiotviet_id: categoryId },
          });

          if (!category) {
            this.logger.error(
              `Category ${categoryId} not found in database for product ${kiotVietProduct.id}`,
            );
          } else {
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

    return { processed: products.length, filtered, synced };
  }

  getAllowedCategoryIds(): string[] {
    return this.allowedCategoryIds;
  }
}
