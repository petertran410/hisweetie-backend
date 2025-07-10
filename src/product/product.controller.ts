// src/product/product.controller.ts - UPDATED FOR KIOTVIET SYNC
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
import { KiotVietService } from './kiotviet.service';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import {
  SyncResult,
  FullSyncResult,
  ValidationResult,
  SyncOrderStep,
} from './types/sync.types';

@ApiTags('product')
@Controller('product')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly kiotVietService: KiotVietService,
  ) {}

  // ================================
  // KIOTVIET SYNC ENDPOINTS
  // ================================

  @Post('kiotviet/sync/full')
  @ApiOperation({
    summary: 'Full sync from KiotViet',
    description:
      'Syncs all trademarks, categories, and products from KiotViet (minimal fields only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Full synchronization completed',
  })
  async fullSyncFromKiotViet() {
    try {
      this.logger.log('Starting full KiotViet synchronization');

      const result = await this.kiotVietService.fullSync();

      const response = {
        success: result.success,
        message: result.success
          ? 'Full synchronization completed successfully'
          : `Full synchronization completed with ${result.errors.length} errors`,
        summary: {
          trademarks: {
            synced: result.trademarks.totalSynced,
            updated: result.trademarks.totalUpdated,
            total: result.trademarks.summary.afterSync,
          },
          categories: {
            synced: result.categories.totalSynced,
            updated: result.categories.totalUpdated,
            total: result.categories.summary.afterSync,
          },
          products: {
            synced: result.products.totalSynced,
            updated: result.products.totalUpdated,
            total: result.products.summary.afterSync,
            syncedFields: [
              'kiotviet_id',
              'code',
              'name',
              'image',
              'price',
              'type',
              'category',
            ],
          },
        },
        errors: result.errors,
        timestamp: new Date().toISOString(),
      };

      if (result.success) {
        this.logger.log(
          'Full KiotViet sync completed successfully',
          response.summary,
        );
      } else {
        this.logger.warn('Full KiotViet sync completed with errors', {
          errorCount: result.errors.length,
          summary: response.summary,
        });
      }

      return response;
    } catch (error) {
      this.logger.error('Full KiotViet sync failed:', error.message);
      throw new BadRequestException(`Full sync failed: ${error.message}`);
    }
  }

  @Post('kiotviet/sync/products')
  @ApiOperation({
    summary: 'Sync products only from KiotViet',
    description:
      'Syncs only products (minimal fields: kiotviet_id, code, name, image, price, type, category)',
  })
  @ApiQuery({
    name: 'since',
    required: false,
    description:
      'Only sync products modified since this date (YYYY-MM-DD format)',
    example: '2024-01-01',
  })
  async syncProductsFromKiotViet(@Query('since') since?: string) {
    try {
      this.logger.log(
        `Starting KiotViet product sync${since ? ` since ${since}` : ''}`,
      );

      // Validate date format if provided
      if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
        throw new BadRequestException(
          'Invalid date format. Use YYYY-MM-DD format.',
        );
      }

      const result = await this.kiotVietService.syncProducts(since);

      const response = {
        success: result.success,
        message: result.success
          ? `Successfully synced ${result.totalSynced + result.totalUpdated} products from KiotViet`
          : `Product sync completed with ${result.errors.length} errors`,
        summary: {
          ...result.summary,
          syncedFields: [
            'kiotviet_id',
            'code',
            'name',
            'image',
            'price',
            'type',
            'category',
          ],
          incrementalSync: !!since,
          sinceDate: since,
        },
        errors: result.errors,
        timestamp: new Date().toISOString(),
      };

      if (result.success) {
        this.logger.log(
          'KiotViet product sync completed successfully',
          response.summary,
        );
      } else {
        this.logger.warn('KiotViet product sync completed with errors', {
          errorCount: result.errors.length,
          summary: response.summary,
        });
      }

      return response;
    } catch (error) {
      this.logger.error('KiotViet product sync failed:', error.message);
      throw new BadRequestException(`Product sync failed: ${error.message}`);
    }
  }

  @Post('kiotviet/sync/categories')
  @ApiOperation({
    summary: 'Sync categories from KiotViet',
    description:
      'Syncs KiotViet categories to separate kiotviet_categories table',
  })
  async syncCategoriesFromKiotViet() {
    try {
      this.logger.log('Starting KiotViet category sync');

      const result = await this.kiotVietService.syncCategories();

      const response = {
        success: result.success,
        message: result.success
          ? `Successfully synced ${result.totalSynced + result.totalUpdated} categories from KiotViet`
          : `Category sync completed with ${result.errors.length} errors`,
        summary: result.summary,
        errors: result.errors,
        timestamp: new Date().toISOString(),
      };

      return response;
    } catch (error) {
      this.logger.error('KiotViet category sync failed:', error.message);
      throw new BadRequestException(`Category sync failed: ${error.message}`);
    }
  }

  @Post('kiotviet/sync/trademarks')
  @ApiOperation({
    summary: 'Sync trademarks from KiotViet',
    description:
      'Syncs KiotViet trademarks to separate kiotviet_trademarks table',
  })
  async syncTrademarksFromKiotViet() {
    try {
      this.logger.log('Starting KiotViet trademark sync');

      const result = await this.kiotVietService.syncTrademarks();

      const response = {
        success: result.success,
        message: result.success
          ? `Successfully synced ${result.totalSynced + result.totalUpdated} trademarks from KiotViet`
          : `Trademark sync completed with ${result.errors.length} errors`,
        summary: result.summary,
        errors: result.errors,
        timestamp: new Date().toISOString(),
      };

      return response;
    } catch (error) {
      this.logger.error('KiotViet trademark sync failed:', error.message);
      throw new BadRequestException(`Trademark sync failed: ${error.message}`);
    }
  }

  @Get('kiotviet/test-connection')
  @ApiOperation({
    summary: 'Test KiotViet API connection',
    description: 'Test the connection to KiotViet API and authentication',
  })
  async testKiotVietConnection() {
    try {
      const result = await this.kiotVietService.testConnection();

      if (result.success) {
        this.logger.log('KiotViet connection test successful');
      } else {
        this.logger.warn('KiotViet connection test failed:', result.message);
      }

      return {
        ...result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('KiotViet connection test error:', error.message);
      throw new BadRequestException(`Connection test failed: ${error.message}`);
    }
  }

  @Get('kiotviet/sync/status')
  @ApiOperation({
    summary: 'Get KiotViet sync status',
    description: 'Get current synchronization status and statistics',
  })
  async getKiotVietSyncStatus() {
    try {
      // Get counts from database
      const [
        totalProducts,
        kiotVietProducts,
        customProducts,
        kiotVietCategories,
        kiotVietTrademarks,
        customCategories,
      ] = await Promise.all([
        this.productService.prisma.product.count(),
        this.productService.prisma.product.count({
          where: { is_from_kiotviet: true },
        }),
        this.productService.prisma.product.count({
          where: { is_from_kiotviet: false },
        }),
        this.productService.prisma.kiotviet_category.count(),
        this.productService.prisma.kiotviet_trademark.count(),
        this.productService.prisma.category.count(),
      ]);

      // Test connection
      let connectionStatus = { success: false, message: 'Not tested' };
      try {
        connectionStatus = await this.kiotVietService.testConnection();
      } catch (error) {
        connectionStatus = { success: false, message: error.message };
      }

      return {
        connected: connectionStatus.success,
        connectionMessage: connectionStatus.message,
        statistics: {
          products: {
            total: totalProducts,
            fromKiotViet: kiotVietProducts,
            custom: customProducts,
          },
          categories: {
            kiotViet: kiotVietCategories,
            custom: customCategories,
          },
          trademarks: {
            kiotViet: kiotVietTrademarks,
          },
        },
        syncConfig: {
          syncedFields: [
            'kiotviet_id',
            'code',
            'name',
            'image',
            'price',
            'type',
            'category',
          ],
          separateTables: ['kiotviet_categories', 'kiotviet_trademarks'],
          productTable: 'product (enhanced with KiotViet fields)',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get KiotViet sync status:', error.message);
      throw new BadRequestException(
        `Failed to get sync status: ${error.message}`,
      );
    }
  }

  // ================================
  // PRODUCT CRUD ENDPOINTS (Existing)
  // ================================

  @Get('get-by-id/:id')
  @ApiOperation({
    summary: 'Get product by ID',
    description:
      'Retrieve a specific product by its ID (includes KiotViet data if available)',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  findById(@Param('id') id: string) {
    return this.productService.findById(+id);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search products',
    description:
      'Search products with pagination and filters (supports visibility filter for CMS)',
  })
  @ApiQuery({
    name: 'includeHidden',
    required: false,
    description: 'Include hidden products (for CMS only)',
  })
  search(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('type') type?: string,
    @Query('categoryId') categoryId?: string,
    @Query('isFromKiotViet') isFromKiotViet?: string,
    @Query('includeHidden') includeHidden?: string,
  ) {
    const filters: any = {};

    if (title) filters.title = title;
    if (type) filters.type = type;
    if (categoryId) filters.categoryId = +categoryId;
    if (isFromKiotViet !== undefined) {
      filters.isFromKiotViet = isFromKiotViet === 'true';
    }
    if (includeHidden !== undefined) {
      filters.includeHidden = includeHidden === 'true';
    }

    return this.productService.search({
      pageSize: +pageSize,
      pageNumber: +pageNumber,
      ...filters,
    });
  }

  @Get('by-categories')
  @ApiOperation({
    summary: 'Get products by categories',
    description:
      'Get products filtered by categories (supports visibility filter for frontend/CMS)',
  })
  @ApiQuery({
    name: 'includeHidden',
    required: false,
    description: 'Include hidden products (for CMS only)',
  })
  getProductsByCategories(
    @Query('pageSize') pageSize: string = '12',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('categoryId') categoryId?: string,
    @Query('kiotVietCategoryId') kiotVietCategoryId?: string,
    @Query('subCategoryId') subCategoryId?: string,
    @Query('orderBy') orderBy?: string,
    @Query('isDesc') isDesc?: string,
    @Query('title') title?: string,
    @Query('includeHidden') includeHidden?: string,
  ) {
    const params: any = {
      pageSize: +pageSize,
      pageNumber: +pageNumber,
    };

    if (categoryId) params.categoryId = +categoryId;
    if (kiotVietCategoryId) params.kiotVietCategoryId = +kiotVietCategoryId;
    if (subCategoryId) params.subCategoryId = +subCategoryId;
    if (orderBy) params.orderBy = orderBy;
    if (isDesc !== undefined) params.isDesc = isDesc === 'true';
    if (title) params.title = title;
    if (includeHidden !== undefined) {
      params.includeHidden = includeHidden === 'true';
    }

    return this.productService.getProductsByCategories(params);
  }

  @Get('cms/get-all')
  @ApiOperation({
    summary: 'Get all products for CMS management',
    description:
      'Get all products including hidden ones for CMS administration',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: 'Number of items per page',
  })
  @ApiQuery({
    name: 'pageNumber',
    required: false,
    description: 'Page number (0-based)',
  })
  @ApiQuery({
    name: 'title',
    required: false,
    description: 'Search by product title',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiQuery({
    name: 'is_visible',
    required: false,
    description: 'Filter by visibility status',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated products for CMS with visibility status',
  })
  getCMSProducts(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('categoryId') categoryId?: string,
    @Query('is_visible') is_visible?: string,
  ) {
    const filters: any = {
      includeHidden: true, // ✅ CMS luôn include hidden products
    };

    if (title) filters.title = title;
    if (categoryId) filters.categoryId = +categoryId;

    // ✅ NEW: Specific visibility filter for CMS
    if (is_visible !== undefined) {
      filters.visibilityFilter = is_visible === 'true';
    }

    return this.productService.searchForCMS({
      pageSize: +pageSize,
      pageNumber: +pageNumber,
      ...filters,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Create product',
    description: 'Create a new custom product (not from KiotViet)',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update product',
    description:
      'Update a product (custom fields only, KiotViet fields are read-only)',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(+id, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete product',
    description:
      'Delete a product (WARNING: KiotViet products will be re-synced)',
  })
  remove(@Param('id') id: string) {
    return this.productService.remove(+id);
  }

  @Patch('toggle-visibility/:id')
  @ApiOperation({
    summary: 'Toggle product visibility',
    description:
      'Toggle the visibility status of a product for frontend display',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({
    status: 200,
    description: 'Product visibility toggled successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        is_visible: { type: 'boolean' },
        title: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  toggleVisibility(@Param('id') id: string) {
    return this.productService.toggleVisibility(+id);
  }

  // THÊM VÀO CLASS ProductController (sau existing endpoints):
  @Patch('bulk-toggle-visibility')
  @ApiOperation({
    summary: 'Bulk toggle product visibility',
    description: 'Toggle visibility for multiple products at once',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        productIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of product IDs to toggle',
        },
        is_visible: {
          type: 'boolean',
          description:
            'Target visibility state (true = visible, false = hidden)',
        },
      },
      required: ['productIds', 'is_visible'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk visibility update completed',
    schema: {
      type: 'object',
      properties: {
        updated: { type: 'number' },
        failed: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  bulkToggleVisibility(
    @Body() bulkToggleDto: { productIds: number[]; is_visible: boolean },
  ) {
    return this.productService.bulkToggleVisibility(
      bulkToggleDto.productIds,
      bulkToggleDto.is_visible,
    );
  }
}
