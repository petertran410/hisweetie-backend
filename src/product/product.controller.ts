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

  // Order Management Endpoints
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

  // KiotViet Sync Endpoints
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

  @Post('sync/target-categories')
  @ApiOperation({
    summary: 'Sync products from Lermao and Trà Phượng Hoàng categories',
    description:
      'Syncs products from Lermao (2205381) and Trà Phượng Hoàng (2205374) and all their children using hierarchical filtering',
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
          ? `Successfully synced ${result.totalSynced} products from Lermao and Trà Phượng Hoàng categories`
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

  @Get('sync/test-connection')
  @ApiOperation({
    summary: 'Test KiotViet connection',
    description: 'Test the connection to KiotViet API',
  })
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
  @ApiOperation({
    summary: 'Get sync status',
    description: 'Get current synchronization status and statistics',
  })
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
          traPhuongHoang: 2205374,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get sync status:', error.message);
      throw new BadRequestException(
        `Failed to get sync status: ${error.message}`,
      );
    }
  }

  // Product CRUD Endpoints
  @Get('get-by-id/:id')
  @ApiOperation({
    summary: 'Get product by ID',
    description: 'Retrieve a specific product by its ID',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  findById(@Param('id') id: string) {
    return this.productService.findById(+id);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search products',
    description: 'Search products with pagination and filters',
  })
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
  @ApiOperation({
    summary: 'Create product',
    description: 'Create a new product',
  })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update product',
    description: 'Update an existing product',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(+id, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete product',
    description: 'Delete a product by ID',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  remove(@Param('id') id: string) {
    return this.productService.remove(+id);
  }

  // Main Product Listing Endpoint (Used by Frontend)
  @Get('by-categories')
  @ApiOperation({
    summary: 'Get products from Lermao and Trà Phượng Hoàng categories',
    description:
      'Returns paginated products from Lermao (2205381) and Trà Phượng Hoàng (2205374) categories including all child categories. This is the main endpoint used by the frontend product listing.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated products with category hierarchy',
  })
  async getProductsByCategories(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
  ) {
    try {
      this.logger.log(
        `Fetching products from Lermao and Trà Phượng Hoàng categories - pageSize: ${pageSize}, pageNumber: ${pageNumber}, title: ${title || 'none'}`,
      );

      const result = await this.productService.getProductsBySpecificCategories({
        pageSize: parseInt(pageSize),
        pageNumber: parseInt(pageNumber),
        title,
        // Default to Lermao (2205381) and Trà Phượng Hoàng (2205374)
        parentCategoryIds: [2205381, 2205374],
      });

      this.logger.log(
        `Successfully found ${result.totalElements} products from target categories`,
      );

      return {
        ...result,
        searchCriteria: {
          pageSize: parseInt(pageSize),
          pageNumber: parseInt(pageNumber),
          title,
          targetCategories: [
            { id: 2205381, name: 'Lermao' },
            { id: 2205374, name: 'Trà Phượng Hoàng' },
          ],
        },
      };
    } catch (error) {
      this.logger.error('Failed to get products by categories:', error.message);
      throw new BadRequestException(`Failed to get products: ${error.message}`);
    }
  }

  @Get('by-hierarchical-categories')
  @ApiOperation({
    summary: 'Get products from hierarchical categories (Advanced)',
    description:
      'Advanced endpoint for getting products from hierarchical categories with custom parent category IDs',
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

      const result = await this.productService.getProductsBySpecificCategories({
        pageSize: searchDto.pageSize || 10,
        pageNumber: searchDto.pageNumber || 0,
        title: searchDto.title,
        parentCategoryIds: parentCategoryIds,
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

  @Get('categories/hierarchy-info')
  @ApiOperation({
    summary: 'Get category hierarchy information',
    description:
      'Returns detailed information about Lermao and Trà Phượng Hoàng category hierarchies',
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
}
