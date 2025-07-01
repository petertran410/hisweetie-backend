// src/category/category.service.ts - FIXED VERSION
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaClient } from '@prisma/client';
import { KiotVietService } from '../product/kiotviet.service';

interface KiotVietCategory {
  categoryId: number;
  categoryName: string;
  parentId?: number;
  retailerId: number;
  createdDate: string;
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
   * NEW: Sync categories from KiotViet to local database
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

      // Fetch hierarchical categories from KiotViet
      this.logger.log('Fetching hierarchical categories from KiotViet...');
      const categoryMappingResult =
        await this.kiotVietService.getCategoryMappingForSync();

      this.logger.log(
        `Fetched ${categoryMappingResult.totalCount} categories from KiotViet (${categoryMappingResult.hierarchicalCategories.length} root categories)`,
      );

      // Process the synchronization with improved transaction handling
      const syncResults = await this.prisma.$transaction(
        async (transactionClient) => {
          let newCategories = 0;
          let updatedCategories = 0;

          // Step 1: Process categories in hierarchical order (parents first, then children)
          const processedCategories = new Set<number>();

          // Helper function to recursively process categories
          const processCategory = async (
            category: KiotVietCategory,
            depth: number = 0,
          ) => {
            try {
              if (processedCategories.has(category.categoryId)) {
                return; // Already processed
              }

              this.logger.debug(
                `Processing category ${category.categoryId} - ${category.categoryName} (depth: ${depth})`,
              );

              // FIXED: Correct type declaration - category object or null, not string
              let existingCategory: any = null;
              try {
                existingCategory = await transactionClient.category.findUnique({
                  where: { id: BigInt(category.categoryId) },
                });
              } catch (findError) {
                this.logger.warn(
                  `Error checking if category ${category.categoryId} exists: ${findError.message}`,
                );
              }

              // Prepare category data
              const categoryData = {
                name: this.sanitizeString(category.categoryName),
                description: `KiotViet category - ${category.categoryName}`,
                parent_id: category.parentId ? BigInt(category.parentId) : null,
                images_url: null,
                priority: category.rank || 0,
                updated_date: new Date(),
              };

              if (existingCategory) {
                // Update existing category
                try {
                  await transactionClient.category.update({
                    where: { id: BigInt(category.categoryId) },
                    data: categoryData,
                  });
                  updatedCategories++;
                  this.logger.debug(
                    `Updated category ${category.categoryId} - ${category.categoryName}`,
                  );
                } catch (updateError) {
                  const errorMsg = `Failed to update category ${category.categoryId}: ${updateError.message}`;
                  this.logger.error(errorMsg);
                  errors.push(errorMsg);
                }
              } else {
                // Create new category
                try {
                  await transactionClient.category.create({
                    data: {
                      id: BigInt(category.categoryId),
                      ...categoryData,
                      created_date: category.createdDate
                        ? new Date(category.createdDate)
                        : new Date(),
                    },
                  });
                  newCategories++;
                  this.logger.debug(
                    `Created new category ${category.categoryId} - ${category.categoryName}`,
                  );
                } catch (createError) {
                  const errorMsg = `Failed to create category ${category.categoryId}: ${createError.message}`;
                  this.logger.error(errorMsg);
                  errors.push(errorMsg);
                }
              }

              processedCategories.add(category.categoryId);

              // Process children recursively
              if (category.children && category.children.length > 0) {
                for (const child of category.children) {
                  await processCategory(child, depth + 1);
                }
              }
            } catch (categoryError) {
              const errorMsg = `Failed to process category ${category.categoryId}: ${categoryError.message}`;
              this.logger.error(errorMsg);
              errors.push(errorMsg);
            }
          };

          // Process all root categories and their children
          for (const rootCategory of categoryMappingResult.hierarchicalCategories) {
            await processCategory(rootCategory);
          }

          totalSynced = newCategories + updatedCategories;
          this.logger.log(
            `Category sync summary: ${newCategories} new, ${updatedCategories} updated, ${totalSynced} total synced`,
          );

          return { newCategories, updatedCategories };
        },
        {
          timeout: 300000, // 5 minute timeout
          isolationLevel: 'Serializable',
        },
      );

      // Get final count after sync
      const afterSyncCount = await this.prisma.category.count();

      // Calculate hierarchical structure stats
      const hierarchicalStats = this.calculateHierarchicalStats(
        categoryMappingResult.hierarchicalCategories,
      );

      const result: CategorySyncResult = {
        success: errors.length === 0,
        totalSynced,
        totalDeleted,
        errors,
        summary: {
          beforeSync: beforeSyncCount,
          afterSync: afterSyncCount,
          newCategories: syncResults.newCategories,
          updatedCategories: syncResults.updatedCategories,
          deletedCategories: totalDeleted,
        },
        hierarchicalStructure: hierarchicalStats,
      };

      if (result.success) {
        this.logger.log('Category synchronization completed successfully', {
          totalSynced: result.totalSynced,
          hierarchicalStats: result.hierarchicalStructure,
        });
      } else {
        this.logger.warn('Category synchronization completed with errors', {
          totalSynced: result.totalSynced,
          errorCount: result.errors.length,
        });
      }

      return result;
    } catch (error) {
      this.logger.error(
        'Category synchronization failed with critical error:',
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
          newCategories: 0,
          updatedCategories: 0,
          deletedCategories: 0,
        },
        hierarchicalStructure: {
          totalRootCategories: 0,
          totalChildCategories: 0,
          maxDepth: 0,
        },
      };
    }
  }

  /**
   * NEW: Force clean and sync categories
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
      const beforeRelationsCount = await this.prisma.category.count();

      this.logger.log(
        `Current categories before cleanup: ${beforeCleanupCount}, product relations: ${beforeRelationsCount}`,
      );

      // Clear all categories and related data from database
      const cleanupResults = await this.prisma.$transaction(async (prisma) => {
        this.logger.log('Starting database cleanup transaction...');

        // Delete product-category relationships first
        const deletedRelations = await prisma.category.deleteMany({});
        this.logger.log(
          `Deleted ${deletedRelations.count} product-category relationships`,
        );

        // Delete all categories
        const deletedCategories = await prisma.category.deleteMany({});
        this.logger.log(`Deleted ${deletedCategories.count} categories`);

        return {
          deletedCategories: deletedCategories.count,
          deletedRelations: deletedRelations.count,
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
   * NEW: Get KiotViet category hierarchy for preview
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
      const categoryMappingResult =
        await this.kiotVietService.getCategoryMappingForSync();
      const stats = this.calculateHierarchicalStats(
        categoryMappingResult.hierarchicalCategories,
      );

      return {
        categories: categoryMappingResult.hierarchicalCategories,
        stats: {
          totalCategories: categoryMappingResult.totalCount,
          rootCategories: stats.totalRootCategories,
          categoriesWithChildren:
            categoryMappingResult.hierarchicalCategories.filter(
              (cat) => cat.hasChild,
            ).length,
          maxDepth: stats.maxDepth,
        },
      };
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
   * Helper function to calculate hierarchical statistics
   */
  private calculateHierarchicalStats(categories: KiotVietCategory[]): {
    totalRootCategories: number;
    totalChildCategories: number;
    maxDepth: number;
  } {
    const countChildren = (
      cats: KiotVietCategory[],
      depth: number = 0,
    ): { count: number; maxDepth: number } => {
      let count = 0;
      let maxDepth = depth;

      for (const cat of cats) {
        count++;
        if (cat.children && cat.children.length > 0) {
          const childResult = countChildren(cat.children, depth + 1);
          count += childResult.count;
          maxDepth = Math.max(maxDepth, childResult.maxDepth);
        }
      }

      return { count, maxDepth };
    };

    const result = countChildren(categories);

    return {
      totalRootCategories: categories.length,
      totalChildCategories: result.count - categories.length,
      maxDepth: result.maxDepth,
    };
  }

  /**
   * Enhanced string sanitization
   */
  private sanitizeString(value: any): string {
    try {
      if (value === null || value === undefined) {
        return '';
      }

      let stringValue = String(value);

      // Remove problematic characters
      stringValue = stringValue
        .replace(/\0/g, '') // Remove null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
        .trim();

      // Limit length
      if (stringValue.length > 500) {
        stringValue = stringValue.substring(0, 500);
        this.logger.warn(`Category name truncated to 500 characters`);
      }

      return stringValue;
    } catch (error) {
      this.logger.error(`Error sanitizing string: ${error.message}`);
      return '';
    }
  }

  // EXISTING METHODS (keeping all your original functionality)

  async postCategory(createCategoryDto: CreateCategoryDto) {
    const { name, description, parentId, imagesUrl, priority } =
      createCategoryDto;

    const category = await this.prisma.category.create({
      data: {
        name,
        description,
        parent_id: parentId ? BigInt(parentId) : null,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : null,
        priority: priority || 0,
        created_date: new Date(),
      },
    });

    return {
      id: category.id.toString(),
      name: category.name,
      description: category.description,
      imagesUrl: category.images_url ? JSON.parse(category.images_url) : [],
      parentId: category.parent_id ? category.parent_id.toString() : null,
      priority: category.priority,
      createdDate: category.created_date,
    };
  }

  async updatePriorities(updateData: any) {
    if (!Array.isArray(updateData)) {
      throw new Error('Expected an array of category priorities');
    }

    const updatePromises = updateData.map(async (item) => {
      const { id, priority } = item;

      return this.prisma.category.update({
        where: { id: BigInt(id) },
        data: { priority: priority },
      });
    });

    await Promise.all(updatePromises);

    return { message: 'Categories prioritized successfully' };
  }

  async getAllCategories(params: {
    pageSize: number;
    pageNumber: number;
    parentId?: string;
  }) {
    const { pageSize, pageNumber, parentId } = params;

    const skip =
      (pageNumber - 1) * pageSize > 0 ? (pageNumber - 1) * pageSize : 0;

    const where = {};
    if (parentId) {
      where['parent_id'] = parentId === 'HOME' ? null : BigInt(parentId);
    }

    const categories = await this.prisma.category.findMany({
      where,
      take: pageSize,
      skip: skip,
      orderBy: { priority: 'asc' },
    });

    const parentIds = categories
      .filter((cat) => cat.parent_id !== null)
      .map((cat) => cat.parent_id!);

    let parentMap = {};
    if (parentIds.length > 0) {
      const parentCategories = await this.prisma.category.findMany({
        where: {
          id: {
            in: parentIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });
      parentMap = parentCategories.reduce((acc, parent) => {
        acc[parent.id.toString()] = parent.name;
        return acc;
      }, {});
    }

    return categories.map((category) => {
      const parentId = category.parent_id
        ? category.parent_id.toString()
        : null;

      return {
        id: category.id.toString(),
        name: category.name,
        description: category.description,
        imagesUrl: category.images_url ? JSON.parse(category.images_url) : [],
        parentId: parentId,
        parentName: parentId ? parentMap[parentId] || null : null,
        priority: category.priority,
      };
    });
  }

  async findOne(id: number) {
    if (isNaN(id) || id <= 0) {
      throw new NotFoundException(`Invalid category ID provided`);
    }

    const categoryResult = await this.prisma.category.findUnique({
      where: { id: BigInt(id) },
    });

    if (!categoryResult) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    let parentName: string | null = null;
    if (categoryResult.parent_id) {
      const parentCategoryResult = await this.prisma.category.findUnique({
        where: { id: categoryResult.parent_id },
      });

      if (parentCategoryResult) {
        parentName = parentCategoryResult.name;
      }
    }

    return {
      id: categoryResult.id.toString(),
      name: categoryResult.name,
      description: categoryResult.description,
      imagesUrl: categoryResult.images_url
        ? JSON.parse(categoryResult.images_url)
        : [],
      parentId: categoryResult.parent_id
        ? categoryResult.parent_id.toString()
        : null,
      parentName: parentName,
      priority: categoryResult.priority,
    };
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    const categoryExists = await this.prisma.category.findUnique({
      where: { id: BigInt(id) },
    });

    if (!categoryExists) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const { name, description, imagesUrl } = updateCategoryDto as any;

    const updateData: any = {
      updated_date: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (imagesUrl !== undefined)
      updateData.images_url = JSON.stringify(imagesUrl);

    const updatedCategory = await this.prisma.category.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    return {
      id: updatedCategory.id.toString(),
      name: updatedCategory.name,
      description: updatedCategory.description,
      imagesUrl: updatedCategory.images_url
        ? JSON.parse(updatedCategory.images_url)
        : [],
      parentId: updatedCategory.parent_id
        ? updatedCategory.parent_id.toString()
        : null,
      priority: updatedCategory.priority,
      updatedDate: updatedCategory.updated_date,
    };
  }

  async remove(id: number) {
    const categoryExists = await this.prisma.category.findUnique({
      where: { id: BigInt(id) },
    });

    if (!categoryExists) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const childCategories = await this.prisma.category.findMany({
      where: { parent_id: BigInt(id) },
    });

    if (childCategories.length > 0) {
      throw new Error('Cannot delete category that has child categories');
    }

    await this.prisma.category.deleteMany({
      where: { id: BigInt(id) },
    });

    await this.prisma.category.delete({
      where: { id: BigInt(id) },
    });

    return { message: `Category with ID ${id} has been deleted` };
  }
}
