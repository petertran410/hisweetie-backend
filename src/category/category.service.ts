// src/category/category.service.ts - FIXED FOR "NEVER" TYPE ERROR
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { PrismaClient, Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { KiotVietAuthService } from 'src/auth/kiotviet-auth/auth.service';

interface KiotVietCategory {
  categoryId: number;
  categoryName: string;
  parentId?: number;
  retailerId?: number;
  createdDate?: string;
  modifiedDate?: string;
  hasChild?: boolean;
  children?: KiotVietCategory[];
  rank?: number;
}

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);
  prisma = new PrismaClient();
  private readonly baseUrl: string;
  private readonly PAGE_SIZE = 100;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly authService: KiotVietAuthService,
  ) {
    const baseUrl = this.configService.get<string>('KIOT_BASE_URL');
    if (!baseUrl) {
      throw new Error('KIOT_BASE_URL environment variable is not configured');
    }
    this.baseUrl = baseUrl;
  }

  async syncAllCategories(): Promise<void> {
    let currentItem = 0;
    let processedCount = 0;
    let totalCategories = 0;
    let consecutiveEmptyPages = 0;
    let consecutiveErrorPages = 0;
    let processedCategoryIds = new Set<number>();

    try {
      const MAX_CONSECUTIVE_EMPTY_PAGES = 3;
      const MAX_CONSECUTIVE_ERROR_PAGES = 3;
      const RETRY_DELAY_MS = 2000;

      while (true) {
        const currentPage = Math.floor(currentItem / this.PAGE_SIZE) + 1;

        if (totalCategories > 0) {
          const progressPercentage = (processedCount / totalCategories) * 100;
          this.logger.log(
            `📄 Fetching page ${currentPage} (${processedCount}/${totalCategories} - ${progressPercentage.toFixed(1)}% completed)`,
          );

          if (processedCount >= totalCategories) {
            this.logger.log(
              `✅ All categories processed successfully! Final count: ${processedCount}/${totalCategories}`,
            );
            break;
          }
        } else {
          this.logger.log(
            `📄 Fetching page ${currentPage} (currentItem: ${currentItem})`,
          );
        }

        try {
          const categoryListResponse = await this.fetchCategoriesWithRetry({
            hierachicalData: true,
            orderBy: 'createdDate',
            orderDirection: 'ASC',
            pageSize: this.PAGE_SIZE,
            currentItem,
          });

          if (!categoryListResponse) {
            this.logger.warn('⚠️ Received null response from KiotViet API');
            consecutiveEmptyPages++;

            if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
              this.logger.log(
                `🔚 API returned null ${consecutiveEmptyPages} times - ending pagination`,
              );
              break;
            }

            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            currentItem += this.PAGE_SIZE;
            continue;
          }

          consecutiveEmptyPages = 0;
          consecutiveErrorPages = 0;

          const { total, data: categories } = categoryListResponse;

          if (total !== undefined && total !== null) {
            if (totalCategories === 0) {
              totalCategories = total;
              this.logger.log(
                `📊 Total categories detected: ${totalCategories}`,
              );
            } else if (total !== totalCategories) {
              this.logger.warn(
                `⚠️ Total count updated: ${totalCategories} → ${total}`,
              );
              totalCategories = total;
            }
          }

          if (!categories || categories.length === 0) {
            this.logger.warn(
              `⚠️ Empty page received at position ${currentItem}`,
            );
            consecutiveEmptyPages++;

            if (totalCategories > 0 && processedCount >= totalCategories) {
              this.logger.log(
                '✅ All expected categories processed - pagination complete',
              );
              break;
            }

            if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
              this.logger.log(
                `🔚 Stopping after ${consecutiveEmptyPages} consecutive empty pages`,
              );
              break;
            }

            currentItem += this.PAGE_SIZE;
            continue;
          }

          const newCategories = categories.filter((category) => {
            if (!category.categoryId || !category.categoryName) {
              this.logger.warn(
                `⚠️ Skipping invalid category: id=${category.categoryId}, name='${category.categoryName}'`,
              );
              return false;
            }

            if (processedCategoryIds.has(category.categoryId)) {
              this.logger.debug(
                `⚠️ Duplicate category ID detected: ${category.categoryId} (${category.categoryName})`,
              );
              return false;
            }

            processedCategoryIds.add(category.categoryId);
            return true;
          });

          if (newCategories.length !== categories.length) {
            this.logger.warn(
              `🔄 Filtered out ${categories.length - newCategories.length} invalid/duplicate categories on page ${currentPage}`,
            );
          }

          if (newCategories.length === 0) {
            this.logger.log(
              `⏭️ Skipping page ${currentPage} - all categories were filtered out`,
            );
            currentItem += this.PAGE_SIZE;
            continue;
          }

          this.logger.log(
            `🔄 Processing ${newCategories.length} categories from page ${currentPage}...`,
          );

          const categoriesWithDetails =
            await this.enrichCategoriesWithDetails(newCategories);
          const savedCategories = await this.saveCategoriesToDatabase(
            categoriesWithDetails,
          );

          processedCount += savedCategories.length;

          if (totalCategories > 0) {
            const completionPercentage =
              (processedCount / totalCategories) * 100;
            this.logger.log(
              `📈 Progress: ${processedCount}/${totalCategories} (${completionPercentage.toFixed(1)}%)`,
            );
          } else {
            this.logger.log(
              `📈 Progress: ${processedCount} categories processed`,
            );
          }

          currentItem += this.PAGE_SIZE;

          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          consecutiveErrorPages++;
          this.logger.error(
            `❌ Error fetching page ${currentPage}: ${error.message}`,
          );

          if (consecutiveErrorPages >= MAX_CONSECUTIVE_ERROR_PAGES) {
            this.logger.error(
              `💥 Too many consecutive errors (${consecutiveErrorPages}). Stopping sync.`,
            );
            throw error;
          }

          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_DELAY_MS * consecutiveErrorPages),
          );
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async fetchCategoriesWithRetry(
    params: {
      hierachicalData?: boolean;
      orderBy?: string;
      orderDirection?: string;
      pageSize?: number;
      currentItem?: number;
      lastModifiedFrom?: string;
    },
    maxRetries: number = 3,
  ): Promise<any> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchCategories(params);
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `⚠️ API attempt ${attempt}/${maxRetries} failed: ${error.message}`,
        );

        if (attempt < maxRetries) {
          const delayMs = 1000 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }

  private async fetchCategories(params: {
    hierachicalData?: boolean;
    orderBy?: string;
    orderDirection?: string;
    pageSize?: number;
    currentItem?: number;
    lastModifiedFrom?: string;
  }): Promise<any> {
    const headers = await this.authService.getRequestHeaders();

    const queryParams = new URLSearchParams({
      hierachicalData: (params.hierachicalData || false).toString(),
      pageSize: (params.pageSize || this.PAGE_SIZE).toString(),
      currentItem: (params.currentItem || 0).toString(),
    });

    if (params.orderBy) {
      queryParams.append('orderBy', params.orderBy);
      queryParams.append('orderDirection', params.orderDirection || 'ASC');
    }

    if (params.lastModifiedFrom) {
      queryParams.append('lastModifiedFrom', params.lastModifiedFrom);
    }

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/categories?${queryParams}`, {
        headers,
        timeout: 30000,
      }),
    );

    return response.data;
  }

  private async enrichCategoriesWithDetails(
    categories: KiotVietCategory[],
  ): Promise<KiotVietCategory[]> {
    this.logger.log(
      `🔍 Enriching ${categories.length} categories with details...`,
    );

    const enrichedCategories: KiotVietCategory[] = [];

    for (const category of categories) {
      try {
        const headers = await this.authService.getRequestHeaders();
        const response = await firstValueFrom(
          this.httpService.get(
            `${this.baseUrl}/categories/${category.categoryId}`,
            {
              headers,
              timeout: 15000,
            },
          ),
        );

        if (response.data && response.data.categoryId) {
          enrichedCategories.push(response.data);
        } else {
          this.logger.warn(
            `⚠️ No detailed data for category ${category.categoryId}, using basic data`,
          );
          enrichedCategories.push(category);
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        this.logger.warn(
          `⚠️ Failed to enrich category ${category.categoryId}: ${error.message}`,
        );
        enrichedCategories.push(category);
      }
    }

    return enrichedCategories;
  }

  private async saveCategoriesToDatabase(
    categories: KiotVietCategory[],
  ): Promise<any[]> {
    this.logger.log(`💾 Saving ${categories.length} categories to database...`);

    const savedCategories: any[] = [];

    const processedCategories = this.flattenAndSortCategories(categories);

    for (const categoryData of processedCategories) {
      try {
        if (
          !categoryData.categoryId ||
          !categoryData.categoryName ||
          categoryData.categoryName.trim() === ''
        ) {
          this.logger.warn(
            `⚠️ Skipping invalid category: categoryId=${categoryData.categoryId}, categoryName='${categoryData.categoryName}'`,
          );
          continue;
        }

        let parentDatabaseId: number | null = null;
        if (categoryData.parentId) {
          const parentCategory =
            await this.prismaService.kiotviet_category.findFirst({
              where: { kiotVietId: categoryData.parentId },
              select: { id: true, name: true },
            });

          if (parentCategory) {
            parentDatabaseId = parentCategory.id;
          } else {
            this.logger.warn(
              `⚠️ Parent category ${categoryData.parentId} not found for category ${categoryData.categoryId}`,
            );
          }
        }

        const category = await this.prismaService.kiotviet_category.upsert({
          where: { kiotVietId: categoryData.categoryId },
          update: {
            name: categoryData.categoryName.trim(),
            parentId: parentDatabaseId,
            hasChild: categoryData.hasChild ?? false,
            retailerId: categoryData.retailerId || null,
            rank: categoryData.rank ?? 0,
            modifiedDate: categoryData.modifiedDate
              ? new Date(categoryData.modifiedDate)
              : new Date(),
            lastSyncedAt: new Date(),
          },
          create: {
            kiotVietId: categoryData.categoryId,
            name: categoryData.categoryName.trim(),
            parentId: parentDatabaseId,
            hasChild: categoryData.hasChild ?? false,
            retailerId: categoryData.retailerId || null,
            rank: categoryData.rank ?? 0,
            createdDate: categoryData.createdDate
              ? new Date(categoryData.createdDate)
              : new Date(),
            modifiedDate: categoryData.modifiedDate
              ? new Date(categoryData.modifiedDate)
              : new Date(),
            lastSyncedAt: new Date(),
          },
        });

        savedCategories.push(category);
      } catch (error) {
        this.logger.error(
          `❌ Failed to save category ${categoryData.categoryName}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `💾 Saved ${savedCategories.length} categories to database`,
    );
    return savedCategories;
  }

  private flattenAndSortCategories(
    categories: KiotVietCategory[],
  ): KiotVietCategory[] {
    const flattened: KiotVietCategory[] = [];
    const visited = new Set<number>();

    const processCategory = (category: KiotVietCategory) => {
      if (visited.has(category.categoryId)) {
        return;
      }

      visited.add(category.categoryId);
      flattened.push(category);

      // Process children recursively
      if (category.children && category.children.length > 0) {
        for (const child of category.children) {
          processCategory(child);
        }
      }
    };

    const rootCategories = categories.filter((cat) => !cat.parentId);
    const childCategories = categories.filter((cat) => cat.parentId);

    for (const rootCategory of rootCategories) {
      processCategory(rootCategory);
    }

    for (const childCategory of childCategories) {
      if (!visited.has(childCategory.categoryId)) {
        processCategory(childCategory);
      }
    }

    this.logger.log(
      `📊 Flattened ${categories.length} hierarchical categories into ${flattened.length} ordered entries`,
    );

    return flattened;
  }

  async postCategory(createCategoryDto: CreateCategoryDto) {
    try {
      // FIXED: Explicit typing for create data to avoid "never" type
      const categoryData: Prisma.categoryCreateInput = {
        name: createCategoryDto.name,
        description: createCategoryDto.description,
        images_url: createCategoryDto.images_url,
        priority: createCategoryDto.priority,
        created_date: new Date(),
        created_by: 'Manual',
        parent_id: createCategoryDto.parent_id
          ? BigInt(createCategoryDto.parent_id)
          : null,
      };

      const category = await this.prisma.category.create({
        data: categoryData,
      });

      this.logger.log(
        `Created manual category: ${category.name} (ID: ${category.id})`,
      );
      return category;
    } catch (error) {
      this.logger.error('Failed to create category:', error.message);
      throw new BadRequestException(
        `Failed to create category: ${error.message}`,
      );
    }
  }

  // FIXED: Separate method for bulk priority updates
  async updatePriorities(updateItems: Array<{ id: string; priority: number }>) {
    try {
      const results: any[] = [];

      for (const item of updateItems) {
        // FIXED: Explicit typing for update data to avoid "never" type
        const updateData: Prisma.categoryUpdateInput = {
          priority: item.priority,
          updated_date: new Date(),
          updated_by: 'Priority_Update',
        };

        const category = await this.prisma.category.update({
          where: { id: BigInt(item.id) },
          data: updateData,
        });
        results.push(category);
      }

      this.logger.log(`Updated priorities for ${results.length} categories`);
      return results;
    } catch (error) {
      this.logger.error('Failed to update priorities:', error.message);
      throw new BadRequestException(
        `Failed to update priorities: ${error.message}`,
      );
    }
  }

  async getAllCategories(params: {
    pageSize: number;
    pageNumber: number;
    parentId?: string;
  }) {
    try {
      const { pageSize, pageNumber, parentId } = params;
      const skip = pageNumber * pageSize;
      const take = pageSize;

      const where: any = {};
      if (parentId) {
        where.parentId = parseInt(parentId);
      }

      const [categories, total] = await Promise.all([
        this.prisma.kiotviet_category.findMany({
          where,
          take,
          orderBy: { rank: 'asc' },
          include: {
            children: {
              orderBy: { rank: 'asc' },
              include: {
                children: {
                  orderBy: { rank: 'asc' },
                },
              },
            },
          },
        }),
        this.prisma.kiotviet_category.count({ where }),
      ]);

      return {
        content: categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          parentId: cat.parentId,
          hasChild: cat.hasChild,
          rank: cat.rank,
          retailerId: cat.retailerId,
          kiotVietId: cat.kiotVietId,
          createdDate: cat.createdDate,
          modifiedDate: cat.modifiedDate,
          syncedAt: cat.lastSyncedAt,
          children:
            cat.children?.map((child) => ({
              id: child.id,
              name: child.name,
              parentId: child.parentId,
              hasChild: child.hasChild,
              rank: child.rank,
              retailerId: child.retailerId,
              kiotVietId: child.kiotVietId,
              createdDate: child.createdDate,
              modifiedDate: child.modifiedDate,
              syncedAt: child.lastSyncedAt,
              children:
                child.children?.map((grandchild) => ({
                  id: grandchild.id,
                  name: grandchild.name,
                  parentId: grandchild.parentId,
                  hasChild: grandchild.hasChild,
                  rank: grandchild.rank,
                  retailerId: grandchild.retailerId,
                  kiotVietId: grandchild.kiotVietId,
                  createdDate: grandchild.createdDate,
                  modifiedDate: grandchild.modifiedDate,
                  syncedAt: grandchild.lastSyncedAt,
                })) || [],
            })) || [],
        })),
        totalElements: total,
        totalPages: Math.ceil(total / pageSize),
        pageNumber,
        pageSize,
      };
    } catch (error) {
      this.logger.error('Failed to get categories:', error.message);
      throw new BadRequestException(
        `Failed to get categories: ${error.message}`,
      );
    }
  }

  async findOne(id: number) {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
      });

      if (!category) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }

      return category;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to find category ${id}:`, error.message);
      throw new BadRequestException(
        `Failed to find category: ${error.message}`,
      );
    }
  }

  async update(id: number, updateData: Partial<CreateCategoryDto>) {
    try {
      const existingCategory = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
      });

      if (!existingCategory) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }

      const updateInput: Prisma.categoryUpdateInput = {
        name: updateData.name,
        description: updateData.description,
        images_url: updateData.images_url,
        priority: updateData.priority,
        parent_id: updateData.parent_id
          ? BigInt(updateData.parent_id)
          : undefined,
        updated_date: new Date(),
        updated_by: 'Manual_Update',
      };

      Object.keys(updateInput).forEach((key) => {
        if (updateInput[key] === undefined) {
          delete updateInput[key];
        }
      });

      const category = await this.prisma.category.update({
        where: { id: BigInt(id) },
        data: updateInput,
      });

      this.logger.log(`Updated category: ${category.name} (ID: ${id})`);
      return category;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update category ${id}:`, error.message);
      throw new BadRequestException(
        `Failed to update category: ${error.message}`,
      );
    }
  }

  async remove(id: number) {
    try {
      const existingCategory = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
      });

      if (!existingCategory) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }

      await this.prisma.category.delete({
        where: { id: BigInt(id) },
      });

      this.logger.log(`Deleted category: ${existingCategory.name} (ID: ${id})`);
      return { message: `Category ${id} deleted successfully` };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete category ${id}:`, error.message);
      throw new BadRequestException(
        `Failed to delete category: ${error.message}`,
      );
    }
  }

  async getCategoryCount(): Promise<number> {
    try {
      return await this.prisma.category.count();
    } catch (error) {
      this.logger.error('Failed to get category count:', error.message);
      throw new BadRequestException(
        `Failed to get category count: ${error.message}`,
      );
    }
  }

  async getProductCategoryRelationsCount(): Promise<number> {
    try {
      return await this.prisma.product.count({
        where: {
          category_id: { not: null },
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to get product category relations count:',
        error.message,
      );
      throw new BadRequestException(
        `Failed to get relations count: ${error.message}`,
      );
    }
  }

  async;
}
