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
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { KiotVietUtils } from '../common/utils/kiotviet.utils';

@ApiTags('product')
@Controller('product')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);
  prisma = new PrismaClient();

  constructor(private readonly productService: ProductService) {}

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

  // FIXED: Enhanced hierarchical product search
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
      let parentCategoryIds: number[];
      if (searchDto.parentCategoryIds) {
        parentCategoryIds = KiotVietUtils.parseCategoryIds(
          searchDto.parentCategoryIds,
        );
        if (parentCategoryIds.length === 0) {
          throw new BadRequestException('Invalid parent category IDs provided');
        }
      }

      const result = await this.productService.getProductsBySpecificCategories({
        pageSize: searchDto.pageSize || 10,
        pageNumber: searchDto.pageNumber || 0,
        title: searchDto.title,
      });

      return {
        ...result,
        searchCriteria: {
          pageSize: searchDto.pageSize || 10,
          pageNumber: searchDto.pageNumber || 0,
          title: searchDto.title,
          includeChildren: searchDto.includeChildren !== false,
          targetParentIds: parentCategoryIds || [2205381, 2205374],
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
          traPhongHoang: 2205374,
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
}
