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
} from '@nestjs/swagger';

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
      'Search products with pagination and filters (includes KiotViet products)',
  })
  search(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('type') type?: string,
    @Query('categoryId') categoryId?: string,
    @Query('isFromKiotViet') isFromKiotViet?: string,
  ) {
    const filters: any = {};

    if (title) filters.title = title;
    if (type) filters.type = type;
    if (categoryId) filters.categoryId = +categoryId;
    if (isFromKiotViet !== undefined) {
      filters.isFromKiotViet = isFromKiotViet === 'true';
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
      'Get products filtered by custom categories or KiotViet categories',
  })
  getProductsByCategories(
    @Query('pageSize') pageSize: string = '12',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('categoryId') categoryId?: string,
    @Query('kiotVietCategoryId') kiotVietCategoryId?: string,
    @Query('orderBy') orderBy?: string,
    @Query('isDesc') isDesc?: string,
  ) {
    const filters: any = {
      pageSize: +pageSize,
      pageNumber: +pageNumber,
    };

    if (categoryId) filters.categoryId = +categoryId;
    if (kiotVietCategoryId) filters.kiotVietCategoryId = +kiotVietCategoryId;
    if (orderBy) filters.orderBy = orderBy;
    if (isDesc !== undefined) filters.isDesc = isDesc === 'true';

    return this.productService.getProductsByCategories(filters);
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

  // ================================
  // KIOTVIET DATA QUERIES
  // ================================

  @Get('kiotviet/categories')
  @ApiOperation({
    summary: 'Get KiotViet categories',
    description: 'Get list of categories synced from KiotViet',
  })
  async getKiotVietCategories(
    @Query('pageSize') pageSize: string = '50',
    @Query('pageNumber') pageNumber: string = '0',
  ) {
    try {
      const skip = +pageNumber * +pageSize;
      const take = +pageSize;

      const [categories, total] = await Promise.all([
        this.productService.prisma.kiotviet_category.findMany({
          skip,
          take,
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: { products: true },
            },
          },
        }),
        this.productService.prisma.kiotviet_category.count(),
      ]);

      return {
        content: categories,
        totalElements: total,
        totalPages: Math.ceil(total / +pageSize),
        pageNumber: +pageNumber,
        pageSize: +pageSize,
      };
    } catch (error) {
      this.logger.error('Failed to get KiotViet categories:', error.message);
      throw new BadRequestException(
        `Failed to get KiotViet categories: ${error.message}`,
      );
    }
  }

  @Get('kiotviet/trademarks')
  @ApiOperation({
    summary: 'Get KiotViet trademarks',
    description: 'Get list of trademarks synced from KiotViet',
  })
  async getKiotVietTrademarks(
    @Query('pageSize') pageSize: string = '50',
    @Query('pageNumber') pageNumber: string = '0',
  ) {
    try {
      const skip = +pageNumber * +pageSize;
      const take = +pageSize;

      const [trademarks, total] = await Promise.all([
        this.productService.prisma.kiotviet_trademark.findMany({
          skip,
          take,
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: { products: true },
            },
          },
        }),
        this.productService.prisma.kiotviet_trademark.count(),
      ]);

      return {
        content: trademarks,
        totalElements: total,
        totalPages: Math.ceil(total / +pageSize),
        pageNumber: +pageNumber,
        pageSize: +pageSize,
      };
    } catch (error) {
      this.logger.error('Failed to get KiotViet trademarks:', error.message);
      throw new BadRequestException(
        `Failed to get KiotViet trademarks: ${error.message}`,
      );
    }
  }

  @Get('kiotviet/sync/prerequisites')
  @ApiOperation({
    summary: 'Check sync prerequisites',
    description: 'Validate if all dependencies are met before syncing products',
  })
  async checkSyncPrerequisites() {
    try {
      const validation = await this.kiotVietService.validateSyncPrerequisites();
      const syncOrder = this.kiotVietService.getSyncOrder();

      return {
        ...validation,
        syncOrder,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to check sync prerequisites:', error.message);
      throw new BadRequestException(
        `Prerequisites check failed: ${error.message}`,
      );
    }
  }

  @Get('kiotviet/sync/order')
  @ApiOperation({
    summary: 'Get recommended sync order',
    description:
      'Get the correct order for syncing KiotViet data to prevent foreign key errors',
  })
  getSyncOrder() {
    return {
      order: this.kiotVietService.getSyncOrder(),
      description:
        'Always sync in this order to prevent foreign key constraint errors',
      recommendations: [
        'Run full sync for automatic correct ordering',
        'If syncing individually, follow the step order',
        'Trademarks and Categories have no dependencies',
        'Products depend on both Trademarks and Categories',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  @Post('kiotviet/sync/validate-and-sync')
  @ApiOperation({
    summary: 'Validate prerequisites and sync all data',
    description:
      'Check prerequisites first, then run full sync if validation passes',
  })
  async validateAndFullSync() {
    try {
      // Step 1: Check prerequisites
      this.logger.log('Checking sync prerequisites...');
      const validation = await this.kiotVietService.validateSyncPrerequisites();

      // Step 2: Run full sync regardless (it will handle dependencies correctly)
      this.logger.log('Starting validated full sync...');
      const result = await this.kiotVietService.fullSync();

      return {
        validation,
        syncResult: result,
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
          },
        },
        errors: result.errors,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Validated full sync failed:', error.message);
      throw new BadRequestException(`Validated sync failed: ${error.message}`);
    }
  }
}
