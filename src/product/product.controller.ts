import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Logger,
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  KiotVietSyncDto,
  HierarchicalProductSearchDto,
} from './dto/kiotviet-sync.dto';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { KiotVietUtils } from '../common/utils/kiotviet.utils';
import { OrderSearchDto } from './dto/order-search.dto';

@ApiTags('product')
@Controller('product')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);
  prisma = new PrismaClient();

  constructor(private readonly productService: ProductService) {}

  @Get('order/admin-search')
  @ApiOperation({
    summary: 'Search orders for admin with pagination and filters',
    description:
      'Returns paginated orders with various filter options for admin dashboard',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated order list with filters applied',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async searchOrders(@Query() searchDto: OrderSearchDto) {
    try {
      this.logger.log('Searching orders with filters:', searchDto);

      const result = await this.productService.searchOrders(searchDto);

      this.logger.log(`Found ${result.totalElements} orders matching criteria`);
      return result;
    } catch (error) {
      this.logger.error('Failed to search orders:', error.message);
      throw new BadRequestException(
        `Failed to search orders: ${error.message}`,
      );
    }
  }

  @Patch('order/:id/status/:status')
  @ApiOperation({
    summary: 'Change order status',
    description: 'Updates the status of a specific order',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiParam({ name: 'status', description: 'New status for the order' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  async changeOrderStatus(
    @Param('id') id: string,
    @Param('status') status: string,
  ) {
    try {
      this.logger.log(`Changing order ${id} status to: ${status}`);

      const result = await this.productService.changeOrderStatus(id, status);

      this.logger.log(`Successfully updated order ${id} status to ${status}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to change order ${id} status:`, error.message);
      throw new BadRequestException(
        `Failed to change order status: ${error.message}`,
      );
    }
  }

  // FIXED: Enhanced sync endpoint with validation
  @Post('sync/full')
  @ApiOperation({
    summary: 'Full product synchronization from KiotViet',
    description:
      'Syncs all products from KiotViet or specific categories. Use with caution on large datasets.',
  })
  @ApiResponse({
    status: 200,
    description: 'Product synchronization completed',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async fullSync(@Body() syncDto: KiotVietSyncDto = {}) {
    try {
      const syncId = KiotVietUtils.generateSyncId('full_sync');
      this.logger.log(`Starting full sync operation: ${syncId}`);

      let categoryNames: string[] | undefined;
      if (syncDto.categories) {
        categoryNames = KiotVietUtils.parseCategoryNames(syncDto.categories);
      }

      if (syncDto.cleanFirst) {
        this.logger.warn(
          'Clean-first option enabled - this will delete all existing products',
        );
      }

      const result = syncDto.cleanFirst
        ? await this.productService.cleanAndSyncCategories(categoryNames || [])
        : await this.productService.forceFullSync(categoryNames);

      const formattedResult = KiotVietUtils.formatSyncResult(
        result,
        'full_sync',
      );
      formattedResult.syncId = syncId;

      return {
        message: result.success
          ? 'Product synchronization completed successfully'
          : 'Product synchronization completed with errors',
        ...formattedResult,
      };
    } catch (error) {
      this.logger.error('Full sync failed:', error.message);
      throw new BadRequestException(`Full sync failed: ${error.message}`);
    }
  }

  // FIXED: Enhanced incremental sync
  @Post('sync/incremental')
  @ApiOperation({
    summary: 'Incremental product synchronization',
    description: 'Syncs only products modified since the specified date',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async incrementalSync(@Body() syncDto: KiotVietSyncDto = {}) {
    try {
      const syncId = KiotVietUtils.generateSyncId('incremental_sync');
      this.logger.log(`Starting incremental sync operation: ${syncId}`);

      // Validate sync date if provided
      if (syncDto.since) {
        const dateValidation = KiotVietUtils.validateSyncDate(syncDto.since);
        if (!dateValidation.isValid) {
          throw new BadRequestException(
            `Invalid sync date: ${dateValidation.error}`,
          );
        }
      }

      let categoryNames: string[] | undefined;
      if (syncDto.categories) {
        categoryNames = KiotVietUtils.parseCategoryNames(syncDto.categories);
      }

      const result = await this.productService.incrementalSync(
        syncDto.since,
        categoryNames,
      );
      const formattedResult = KiotVietUtils.formatSyncResult(
        result,
        'incremental_sync',
      );
      formattedResult.syncId = syncId;

      return {
        message: result.success
          ? 'Incremental synchronization completed successfully'
          : 'Incremental synchronization completed with errors',
        ...formattedResult,
      };
    } catch (error) {
      this.logger.error('Incremental sync failed:', error.message);
      throw new BadRequestException(
        `Incremental sync failed: ${error.message}`,
      );
    }
  }

  // FIXED: Enhanced target categories sync
  @Post('sync/target-categories')
  @ApiOperation({
    summary: 'Sync products from target categories (Lermao + Trà Phượng Hoàng)',
    description:
      'Syncs products from specific target categories and all their children using hierarchical filtering',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async syncTargetCategories(@Body() syncDto: KiotVietSyncDto = {}) {
    try {
      const syncId = KiotVietUtils.generateSyncId('target_categories_sync');
      this.logger.log(`Starting target categories sync operation: ${syncId}`);

      // Validate sync date if provided
      if (syncDto.since) {
        const dateValidation = KiotVietUtils.validateSyncDate(syncDto.since);
        if (!dateValidation.isValid) {
          throw new BadRequestException(
            `Invalid sync date: ${dateValidation.error}`,
          );
        }
      }

      const result = await this.productService.syncProductsFromTargetCategories(
        syncDto.since,
      );
      const formattedResult = KiotVietUtils.formatSyncResult(
        result,
        'target_categories_sync',
      );
      formattedResult.syncId = syncId;

      return {
        message: result.success
          ? `Successfully synced ${result.totalSynced} products from target category hierarchy`
          : `Target category sync completed with ${result.errors.length} errors`,
        targetCategories: ['Lermao (2205381)', 'Trà Phượng Hoàng (2205374)'],
        ...formattedResult,
      };
    } catch (error) {
      this.logger.error('Target category sync failed:', error.message);
      throw new BadRequestException(
        `Target category sync failed: ${error.message}`,
      );
    }
  }

  @Get('by-hierarchical-categories')
  @ApiOperation({
    summary: 'Get products from hierarchical categories',
    description:
      'Returns products from Lermao and Trà Phượng Hoàng categories including all child categories',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getProductsByHierarchicalCategories(
    @Query() searchDto: HierarchicalProductSearchDto,
  ) {
    try {
      let parentCategoryIds: number[] = [2205381, 2205374]; // Default: Lermao and Trà Phượng Hoàng

      if (searchDto.parentCategoryIds) {
        parentCategoryIds = KiotVietUtils.parseCategoryIds(
          searchDto.parentCategoryIds,
        );
        if (parentCategoryIds.length === 0) {
          throw new BadRequestException('Invalid parent category IDs provided');
        }
      }

      this.logger.log(
        `Fetching products for parent categories: ${parentCategoryIds.join(', ')}`,
      );

      // FIXED: Pass parentCategoryIds to the service method
      const result = await this.productService.getProductsBySpecificCategories({
        pageSize: searchDto.pageSize || 10,
        pageNumber: searchDto.pageNumber || 0,
        title: searchDto.title,
        parentCategoryIds: parentCategoryIds, // This was the missing piece!
      });

      return {
        ...result,
        searchCriteria: {
          pageSize: searchDto.pageSize || 10,
          pageNumber: searchDto.pageNumber || 0,
          title: searchDto.title,
          includeChildren: searchDto.includeChildren !== false,
          targetParentIds: parentCategoryIds,
        },
      };
    } catch (error) {
      this.logger.error(
        'Failed to get products by hierarchical categories:',
        error.message,
      );
      throw new BadRequestException(`Failed to get products: ${error.message}`);
    }
  }

  // FIXED: Enhanced category hierarchy info
  @Get('categories/hierarchy-info')
  @ApiOperation({
    summary: 'Get category hierarchy information',
    description:
      'Returns detailed information about category hierarchies for target categories',
  })
  async getCategoryHierarchyInfo(@Query('categoryIds') categoryIds?: string) {
    try {
      let targetParentIds = [2205381, 2205374]; // Default: Lermao and Trà Phượng Hoàng

      if (categoryIds) {
        const parsedIds = KiotVietUtils.parseCategoryIds(categoryIds);
        if (parsedIds.length > 0) {
          targetParentIds = parsedIds;
        }
      }

      // Get all descendant category IDs
      const allDescendantIds =
        await this.productService['kiotVietService'].findDescendantCategoryIds(
          targetParentIds,
        );

      // Get hierarchical structure
      const hierarchyPreview =
        await this.productService[
          'kiotVietService'
        ].fetchHierarchicalCategories();

      // Find the target categories in the hierarchy
      const targetCategories = hierarchyPreview.filter((cat) =>
        targetParentIds.includes(cat.categoryId),
      );

      // Count products in each category
      const productCounts = await Promise.all(
        allDescendantIds.map(async (categoryId) => {
          const count = await this.prisma.product_categories.count({
            where: { categories_id: BigInt(categoryId) },
          });
          return { categoryId, productCount: count };
        }),
      );

      return {
        targetParentIds,
        targetCategories: targetCategories.map((cat) => ({
          id: cat.categoryId,
          name: cat.categoryName,
          hasChildren: cat.hasChild,
          childrenCount: cat.children ? cat.children.length : 0,
          children:
            cat.children?.map((child) => ({
              id: child.categoryId,
              name: child.categoryName,
              hasChildren: child.hasChild,
              productCount:
                productCounts.find((pc) => pc.categoryId === child.categoryId)
                  ?.productCount || 0,
            })) || [],
          productCount:
            productCounts.find((pc) => pc.categoryId === cat.categoryId)
              ?.productCount || 0,
        })),
        allDescendantIds,
        productCounts,
        summary: {
          totalParentCategories: targetParentIds.length,
          totalDescendantCategories: allDescendantIds.length,
          additionalChildCategories:
            allDescendantIds.length - targetParentIds.length,
          totalProductsInHierarchy: productCounts.reduce(
            (sum, pc) => sum + pc.productCount,
            0,
          ),
        },
      };
    } catch (error) {
      this.logger.error(
        'Failed to get category hierarchy info:',
        error.message,
      );
      throw new BadRequestException(
        `Failed to get hierarchy info: ${error.message}`,
      );
    }
  }

  // EXISTING ENDPOINTS (keeping all your original functionality)

  @Get('sync/test-connection')
  async testConnection() {
    try {
      const result =
        await this.productService['kiotVietService'].testConnection();

      if (result.success) {
        this.logger.log('KiotViet connection test successful');
      } else {
        this.logger.warn('KiotViet connection test failed:', result.message);
      }

      return result;
    } catch (error) {
      this.logger.error('Connection test error:', error.message);
      throw new BadRequestException(`Connection test failed: ${error.message}`);
    }
  }

  @Get('sync/status')
  async getSyncStatus() {
    try {
      const totalProducts = await this.productService
        .search({
          pageSize: 1,
          pageNumber: 0,
        })
        .then((result) => result.totalElements);

      let kiotVietConfigured = false;
      let configMessage = '';

      try {
        const connectionTest =
          await this.productService['kiotVietService'].testConnection();
        kiotVietConfigured = connectionTest.success;
        configMessage = connectionTest.message;
      } catch (error) {
        this.logger.warn('KiotViet not configured:', error.message);
        configMessage = `KiotViet configuration error: ${error.message}`;
      }

      return {
        totalProducts,
        lastSyncAttempt: null,
        syncEnabled: true,
        kiotVietConfigured,
        message: configMessage,
        targetCategories: {
          lermao: 2205381,
          traPhuongngHoang: 2205374,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get sync status:', error.message);
      throw new BadRequestException(
        `Failed to get sync status: ${error.message}`,
      );
    }
  }

  // Keep all your existing endpoints...
  @Get('get-by-id/:id')
  findById(@Param('id') id: string) {
    return this.productService.findById(+id);
  }

  @Get('search')
  search(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('type') type?: string,
  ) {
    return this.productService.search({
      pageSize: parseInt(pageSize),
      pageNumber: parseInt(pageNumber),
      title,
      type,
    });
  }

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(+id, updateProductDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productService.remove(+id);
  }

  // Updated by-categories endpoint
  @Get('by-categories')
  @ApiOperation({
    summary:
      'Get products from specific categories (Legacy endpoint - use by-hierarchical-categories instead)',
    description:
      'Returns paginated products from Lermao and Trà Phượng Hoàng categories including all child categories',
  })
  async getProductsByCategories(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
  ) {
    // Redirect to the new hierarchical method
    return this.getProductsByHierarchicalCategories({
      pageSize: parseInt(pageSize),
      pageNumber: parseInt(pageNumber),
      title,
    });
  }

  @Get('debug/database-info')
  @ApiOperation({
    summary: 'Debug: Get database information',
    description:
      'Returns information about products and categories in the database for debugging',
  })
  async getDatabaseInfo() {
    try {
      // Get total counts
      const totalProducts = await this.prisma.product.count();
      const totalCategories = await this.prisma.category.count();
      const totalProductCategories =
        await this.prisma.product_categories.count();

      // Get sample products with their types
      const sampleProducts = await this.prisma.product.findMany({
        take: 10,
        select: {
          id: true,
          title: true,
          type: true,
          created_date: true,
        },
        orderBy: { created_date: 'desc' },
      });

      // Get unique product types
      const productTypes = await this.prisma.product.findMany({
        select: { type: true },
        distinct: ['type'],
      });

      // Get sample categories
      const sampleCategories = await this.prisma.category.findMany({
        take: 10,
        select: {
          id: true,
          name: true,
        },
      });

      // Get products with category relationships
      const productsWithCategories = await this.prisma.product.findMany({
        take: 5,
        include: {
          product_categories: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return {
        counts: {
          totalProducts,
          totalCategories,
          totalProductCategories,
        },
        productTypes: productTypes.map((p) => p.type).filter(Boolean),
        sampleProducts: sampleProducts.map((p) => ({
          id: p.id.toString(),
          title: p.title,
          type: p.type,
          createdDate: p.created_date,
        })),
        sampleCategories: sampleCategories.map((c) => ({
          id: c.id.toString(),
          name: c.name,
        })),
        productsWithCategories: productsWithCategories.map((p) => ({
          id: p.id.toString(),
          title: p.title,
          type: p.type,
          categories: p.product_categories.map((pc) => ({
            id: pc.categories_id.toString(),
            name: pc.category?.name || 'Unknown',
          })),
        })),
      };
    } catch (error) {
      this.logger.error('Error getting database info:', error.message);
      throw new BadRequestException(
        `Failed to get database info: ${error.message}`,
      );
    }
  }

  @Get('debug/test-search')
  @ApiOperation({
    summary: 'Debug: Test product search',
    description:
      'Test different search parameters to debug the product listing issue',
  })
  async testProductSearch(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('type') type?: string,
  ) {
    try {
      this.logger.log(
        `Testing search with params: pageSize=${pageSize}, pageNumber=${pageNumber}, title=${title}, type=${type}`,
      );

      const result = await this.productService.search({
        pageSize: parseInt(pageSize),
        pageNumber: parseInt(pageNumber),
        title,
        type,
      });

      return {
        searchParams: {
          pageSize: parseInt(pageSize),
          pageNumber: parseInt(pageNumber),
          title,
          type,
        },
        result,
        message: `Found ${result.totalElements} products`,
      };
    } catch (error) {
      this.logger.error('Error in test search:', error.message);
      return {
        error: error.message,
        searchParams: {
          pageSize: parseInt(pageSize),
          pageNumber: parseInt(pageNumber),
          title,
          type,
        },
      };
    }
  }

  @Get('debug/test-hierarchical')
  @ApiOperation({
    summary: 'Debug: Test hierarchical product search',
    description: 'Test the hierarchical category search that should be working',
  })
  async testHierarchicalSearch(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
  ) {
    try {
      this.logger.log(
        `Testing hierarchical search with params: pageSize=${pageSize}, pageNumber=${pageNumber}, title=${title}`,
      );

      const result = await this.productService.getProductsBySpecificCategories({
        pageSize: parseInt(pageSize),
        pageNumber: parseInt(pageNumber),
        title,
      });

      return {
        searchParams: {
          pageSize: parseInt(pageSize),
          pageNumber: parseInt(pageNumber),
          title,
        },
        result,
        message: `Found ${result.totalElements} products`,
      };
    } catch (error) {
      this.logger.error('Error in test hierarchical search:', error.message);
      return {
        error: error.message,
        searchParams: {
          pageSize: parseInt(pageSize),
          pageNumber: parseInt(pageNumber),
          title,
        },
      };
    }
  }

  @Get('debug/category-mapping')
  @ApiOperation({
    summary: 'Debug: Check category mapping',
    description:
      'Debug endpoint to check how categories are mapped and what products exist',
  })
  @ApiQuery({
    name: 'parentCategoryIds',
    required: false,
    description: 'Comma-separated parent category IDs',
  })
  async debugCategoryMapping(
    @Query('parentCategoryIds') parentCategoryIds?: string,
  ) {
    try {
      const targetIds = parentCategoryIds
        ? KiotVietUtils.parseCategoryIds(parentCategoryIds)
        : [2205381, 2205374];

      this.logger.log(
        `Debug: Checking category mapping for IDs: ${targetIds.join(', ')}`,
      );

      // Get descendant category IDs
      const allDescendantIds =
        await this.productService['kiotVietService'].findDescendantCategoryIds(
          targetIds,
        );

      // Check products in these categories
      const categoryIdsBigInt = allDescendantIds.map((id) => BigInt(id));
      const productCategoryRelations =
        await this.prisma.product_categories.findMany({
          where: {
            categories_id: {
              in: categoryIdsBigInt,
            },
          },
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            product: {
              select: {
                id: true,
                title: true,
                type: true,
              },
            },
          },
          take: 20, // Limit for debugging
        });

      // Group by category
      const categoryGroups = {};
      productCategoryRelations.forEach((rel) => {
        const catId = rel.categories_id.toString();
        const catName = rel.category?.name || 'Unknown';

        if (!categoryGroups[catId]) {
          categoryGroups[catId] = {
            categoryId: catId,
            categoryName: catName,
            products: [],
          };
        }

        if (rel.product) {
          categoryGroups[catId].products.push({
            id: rel.product.id.toString(),
            title: rel.product.title,
            type: rel.product.type,
          });
        }
      });

      return {
        requestedParentIds: targetIds,
        allDescendantIds,
        totalDescendantCategories: allDescendantIds.length,
        totalProductRelations: productCategoryRelations.length,
        categoryGroups: Object.values(categoryGroups),
        summary: {
          parentCategories: targetIds.length,
          descendantCategories: allDescendantIds.length,
          categoriesWithProducts: Object.keys(categoryGroups).length,
          totalProductsFound: productCategoryRelations.length,
        },
      };
    } catch (error) {
      this.logger.error('Debug category mapping failed:', error.message);
      throw new BadRequestException(`Debug failed: ${error.message}`);
    }
  }
}
