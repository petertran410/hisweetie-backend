// src/category/category.service.ts - FIXED FOR "NEVER" TYPE ERROR
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaClient, Prisma } from '@prisma/client';
import { KiotVietService } from '../product/kiotviet.service';

interface KiotVietCategory {
  categoryId: number;
  categoryName: string;
  parentId?: number;
  retailerId?: number; // Made optional to match API
  createdDate?: string;
  modifiedDate?: string;
  hasChild?: boolean;
  children?: KiotVietCategory[];
  rank?: number;
}

interface CategorySyncResult {
  success: boolean;
  totalSynced: number;
  totalDeleted: number;
  errors: string[];
  summary: {
    beforeSync: number;
    afterSync: number;
    newCategories: number;
    updatedCategories: number;
    deletedCategories: number;
  };
  hierarchicalStructure: {
    totalRootCategories: number;
    totalChildCategories: number;
    maxDepth: number;
  };
}

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);
  prisma = new PrismaClient();

  constructor(private readonly kiotVietService: KiotVietService) {}

  /**
   * FIXED: Sync categories from KiotViet using correct method and types
   */
  async syncCategoriesFromKiotViet(): Promise<CategorySyncResult> {
    this.logger.log('Starting category synchronization from KiotViet');

    const errors: string[] = [];
    let totalSynced = 0;
    let totalDeleted = 0;

    try {
      // Get current category count before sync
      const beforeSyncCount = await this.prisma.category.count();
      this.logger.log(`Current categories in database: ${beforeSyncCount}`);

      // Use the correct method from KiotVietService
      this.logger.log('Fetching categories from KiotViet...');
      const kiotVietCategories =
        await this.kiotVietService.fetchAllCategories();

      this.logger.log(
        `Fetched ${kiotVietCategories.length} categories from KiotViet`,
      );

      // FIXED: Process the synchronization with explicit typing
      const syncResults = await this.prisma.$transaction(
        async (tx) => {
          let newCategories = 0;
          let updatedCategories = 0;

          // Process categories
          for (const categoryData of kiotVietCategories) {
            try {
              // FIXED: Explicit typing to avoid "never" type
              const existingCategory = await tx.category.findFirst({
                where: { name: categoryData.categoryName },
              });

              if (existingCategory) {
                // Update existing category - FIXED: Explicit data typing
                const updateData: Prisma.categoryUpdateInput = {
                  name: categoryData.categoryName,
                  updated_date: new Date(),
                  updated_by: 'KiotViet_Sync',
                };

                await tx.category.update({
                  where: { id: existingCategory.id },
                  data: updateData,
                });
                updatedCategories++;
                this.logger.debug(
                  `Updated category: ${categoryData.categoryName}`,
                );
              } else {
                // Create new category - FIXED: Explicit data typing
                const createData: Prisma.categoryCreateInput = {
                  name: categoryData.categoryName,
                  description: `Synced from KiotViet (ID: ${categoryData.categoryId})`,
                  created_date: new Date(),
                  created_by: 'KiotViet_Sync',
                  priority: categoryData.rank || 0,
                };

                await tx.category.create({
                  data: createData,
                });
                newCategories++;
                this.logger.debug(
                  `Created category: ${categoryData.categoryName}`,
                );
              }
            } catch (error) {
              errors.push(
                `Failed to sync category ${categoryData.categoryName}: ${error.message}`,
              );
              this.logger.error(
                `Error syncing category ${categoryData.categoryName}:`,
                error.message,
              );
            }
          }

          return { newCategories, updatedCategories };
        },
        {
          timeout: 300000, // 5 minutes timeout
        },
      );

      const afterSyncCount = await this.prisma.category.count();
      totalSynced = syncResults.newCategories;

      this.logger.log(
        `Category sync completed: ${syncResults.newCategories} new, ${syncResults.updatedCategories} updated`,
      );

      return {
        success: errors.length === 0,
        totalSynced,
        totalDeleted: 0,
        errors,
        summary: {
          beforeSync: beforeSyncCount,
          afterSync: afterSyncCount,
          newCategories: syncResults.newCategories,
          updatedCategories: syncResults.updatedCategories,
          deletedCategories: 0,
        },
        hierarchicalStructure: {
          totalRootCategories: kiotVietCategories.filter((cat) => !cat.parentId)
            .length,
          totalChildCategories: kiotVietCategories.filter((cat) => cat.parentId)
            .length,
          maxDepth: this.calculateMaxDepth(kiotVietCategories),
        },
      };
    } catch (error) {
      this.logger.error('Category sync failed:', error.message);
      throw new BadRequestException(`Category sync failed: ${error.message}`);
    }
  }

  /**
   * FIXED: Clean and sync using correct types
   */
  async cleanAndSyncCategories(): Promise<
    CategorySyncResult & {
      cleanupInfo: {
        deletedCategories: number;
        deletedRelations: number;
      };
    }
  > {
    this.logger.log('Starting clean database and category sync');

    try {
      const beforeCleanupCount = await this.prisma.category.count();
      this.logger.log(
        `Current categories before cleanup: ${beforeCleanupCount}`,
      );

      // Clear all categories from database
      const cleanupResults = await this.prisma.$transaction(async (tx) => {
        this.logger.log('Starting database cleanup transaction...');

        // Delete all categories
        const deletedCategories = await tx.category.deleteMany({});
        this.logger.log(`Deleted ${deletedCategories.count} categories`);

        return {
          deletedCategories: deletedCategories.count,
          deletedRelations: 0,
        };
      });

      // Verify database is clean
      const afterCleanupCount = await this.prisma.category.count();
      if (afterCleanupCount !== 0) {
        throw new Error(
          `Database cleanup failed: ${afterCleanupCount} categories still remain`,
        );
      }
      this.logger.log('Database successfully cleaned - no categories remain');

      // Perform fresh sync
      this.logger.log('Now syncing fresh category data from KiotViet');
      const syncResult = await this.syncCategoriesFromKiotViet();

      const enhancedResult = {
        ...syncResult,
        cleanupInfo: cleanupResults,
      };

      if (syncResult.success) {
        this.logger.log(
          `Clean and sync completed successfully! ` +
            `Removed ${cleanupResults.deletedCategories} old categories, ` +
            `added ${syncResult.totalSynced} new categories`,
        );
      } else {
        this.logger.warn(
          `Clean and sync completed with errors. ` +
            `Removed ${cleanupResults.deletedCategories} old categories, ` +
            `added ${syncResult.totalSynced} new categories, but ${syncResult.errors.length} errors occurred.`,
        );
      }

      return enhancedResult;
    } catch (error) {
      this.logger.error(`Clean and sync operation failed: ${error.message}`);
      throw new BadRequestException(`Clean and sync failed: ${error.message}`);
    }
  }

  /**
   * Get KiotViet category hierarchy using correct types
   */
  async getKiotVietCategoryHierarchy(): Promise<{
    categories: KiotVietCategory[];
    stats: {
      totalCategories: number;
      rootCategories: number;
      categoriesWithChildren: number;
      maxDepth: number;
    };
  }> {
    try {
      const categories: KiotVietCategory[] =
        await this.kiotVietService.fetchAllCategories();

      const stats = {
        totalCategories: categories.length,
        rootCategories: categories.filter((cat) => !cat.parentId).length,
        categoriesWithChildren: categories.filter((cat) => cat.hasChild).length,
        maxDepth: this.calculateMaxDepth(categories),
      };

      return { categories, stats };
    } catch (error) {
      this.logger.error(
        'Failed to get KiotViet category hierarchy:',
        error.message,
      );
      throw new BadRequestException(
        `Failed to get category hierarchy: ${error.message}`,
      );
    }
  }

  /**
   * Helper function to calculate max depth of category hierarchy
   */
  private calculateMaxDepth(categories: KiotVietCategory[]): number {
    let maxDepth = 0;

    const findDepth = (
      categoryId: number,
      currentDepth: number = 0,
    ): number => {
      const children = categories.filter((cat) => cat.parentId === categoryId);
      if (children.length === 0) {
        return currentDepth;
      }

      let maxChildDepth = currentDepth;
      for (const child of children) {
        const childDepth = findDepth(child.categoryId, currentDepth + 1);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }

      return maxChildDepth;
    };

    // Find depth for all root categories
    const rootCategories = categories.filter((cat) => !cat.parentId);
    for (const root of rootCategories) {
      const depth = findDepth(root.categoryId, 1);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }

  // ================================
  // EXISTING METHODS (FIXED FOR TYPE SAFETY)
  // ================================

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
      const results = [];

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

      const where: Prisma.categoryWhereInput = {};
      if (parentId) {
        where.parent_id = BigInt(parentId);
      }

      const [categories, total] = await Promise.all([
        this.prisma.category.findMany({
          where,
          skip,
          take,
          orderBy: [{ priority: 'asc' }, { name: 'asc' }],
        }),
        this.prisma.category.count({ where }),
      ]);

      return {
        content: categories,
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

  // FIXED: Single category update method with proper typing
  async update(id: number, updateData: Partial<CreateCategoryDto>) {
    // FIXED: Use Partial<CreateCategoryDto>
    try {
      const existingCategory = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
      });

      if (!existingCategory) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }

      // FIXED: Explicit typing for update data
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

      // Remove undefined values
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
}
