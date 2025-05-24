import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { OrderSearchDto } from './dto/order-search.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse, // <-- This import is important!
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('products')
@Controller('product')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(private readonly productService: ProductService) {}

  // KiotViet synchronization endpoints

  @Post('sync/full')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force full synchronization with KiotViet',
    description:
      'Replaces all local products with data from KiotViet. This operation may take several minutes for large product catalogs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Synchronization completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        totalSynced: { type: 'number' },
        totalDeleted: { type: 'number' },
        errors: { type: 'array', items: { type: 'string' } },
        summary: {
          type: 'object',
          properties: {
            beforeSync: { type: 'number' },
            afterSync: { type: 'number' },
            newProducts: { type: 'number' },
            updatedProducts: { type: 'number' },
            deletedProducts: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - KiotViet credentials not configured or API error',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error during synchronization',
  })
  async fullSync() {
    this.logger.log('Full product synchronization requested');

    try {
      const result = await this.productService.forceFullSync();

      this.logger.log(
        `Full sync completed: ${result.success ? 'Success' : 'Failed'}`,
        {
          totalSynced: result.totalSynced,
          totalDeleted: result.totalDeleted,
          errorCount: result.errors.length,
        },
      );

      return {
        message: result.success
          ? 'Product synchronization completed successfully'
          : 'Product synchronization completed with errors',
        ...result,
      };
    } catch (error) {
      this.logger.error('Full sync failed:', error.message);
      throw error;
    }
  }

  @Post('sync/incremental')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Incremental synchronization with KiotViet',
    description:
      'Syncs only products that have been modified since the last sync. More efficient for regular updates.',
  })
  @ApiQuery({
    name: 'since',
    required: false,
    description:
      'ISO date string to sync products modified since this date. If not provided, uses last sync timestamp.',
    example: '2024-01-01T00:00:00Z',
  })
  @ApiResponse({
    status: 200,
    description: 'Incremental synchronization completed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid date format or KiotViet API error',
  })
  async incrementalSync(@Query('since') since?: string) {
    this.logger.log(
      `Incremental product synchronization requested${since ? ` since ${since}` : ''}`,
    );

    try {
      const result = await this.productService.incrementalSync(since);

      this.logger.log(
        `Incremental sync completed: ${result.success ? 'Success' : 'Failed'}`,
        {
          totalSynced: result.totalSynced,
          totalDeleted: result.totalDeleted,
          errorCount: result.errors.length,
        },
      );

      return {
        message: result.success
          ? 'Incremental synchronization completed successfully'
          : 'Incremental synchronization completed with errors',
        ...result,
      };
    } catch (error) {
      this.logger.error('Incremental sync failed:', error.message);
      throw error;
    }
  }

  @Get('sync/test-connection')
  @ApiOperation({
    summary: 'Test KiotViet connection',
    description:
      'Tests the connection to KiotViet API and verifies authentication credentials.',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection test completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        tokenInfo: {
          type: 'object',
          properties: {
            expiresAt: { type: 'string', format: 'date-time' },
            tokenType: { type: 'string' },
          },
        },
      },
    },
  })
  async testConnection() {
    this.logger.log('KiotViet connection test requested');

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
      throw error;
    }
  }

  @Get('sync/status')
  @ApiOperation({
    summary: 'Get synchronization status',
    description:
      'Returns information about the current state of product synchronization and statistics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Synchronization status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalProducts: { type: 'number' },
        lastSyncAttempt: { type: 'string', format: 'date-time' },
        syncEnabled: { type: 'boolean' },
        kiotVietConfigured: { type: 'boolean' },
      },
    },
  })
  async getSyncStatus() {
    try {
      // Get basic statistics about current product state
      const totalProducts = await this.productService
        .search({
          pageSize: 1,
          pageNumber: 0,
        })
        .then((result) => result.totalElements);

      // Check if KiotViet is properly configured by testing connection
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
        lastSyncAttempt: null, // You might want to store this in a config table
        syncEnabled: true,
        kiotVietConfigured,
        message: configMessage,
      };
    } catch (error) {
      this.logger.error('Failed to get sync status:', error.message);
      throw error;
    }
  }

  // Add these new endpoints to src/product/product.controller.ts

  /**
   * Force sync products from specific categories only
   * This allows you to sync only "Lermao" and "Trà Phượng Hoàng" categories
   */
  @Post('sync/full/categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force full synchronization for specific categories',
    description:
      'Syncs only products from specified categories (e.g., "Lermao", "Trà Phượng Hoàng"). ' +
      'This is more efficient than syncing all products when you only need specific product lines.',
  })
  @ApiQuery({
    name: 'categories',
    required: true,
    description: 'Comma-separated list of category names to sync',
    example: 'Lermao,Trà Phượng Hoàng',
  })
  @ApiResponse({
    status: 200,
    description: 'Category-filtered synchronization completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        totalSynced: { type: 'number' },
        totalDeleted: { type: 'number' },
        errors: { type: 'array', items: { type: 'string' } },
        filteredCategories: { type: 'array', items: { type: 'string' } },
        summary: {
          type: 'object',
          properties: {
            beforeSync: { type: 'number' },
            afterSync: { type: 'number' },
            newProducts: { type: 'number' },
            updatedProducts: { type: 'number' },
            deletedProducts: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid category names or KiotViet API error',
  })
  async fullSyncByCategories(@Query('categories') categories: string) {
    this.logger.log(`Category-filtered full sync requested for: ${categories}`);

    if (!categories || categories.trim() === '') {
      throw new BadRequestException(
        'Categories parameter is required. Example: ?categories=Lermao,Trà Phượng Hoàng',
      );
    }

    // Parse the comma-separated category names
    const categoryNames = categories
      .split(',')
      .map((cat) => cat.trim())
      .filter((cat) => cat.length > 0);

    if (categoryNames.length === 0) {
      throw new BadRequestException(
        'At least one valid category name is required',
      );
    }

    this.logger.log(
      `Parsed ${categoryNames.length} categories: ${categoryNames.join(', ')}`,
    );

    try {
      const result = await this.productService.forceFullSync(categoryNames);

      this.logger.log(
        `Category sync completed: ${result.success ? 'Success' : 'Failed'}`,
        {
          categories: categoryNames,
          totalSynced: result.totalSynced,
          totalDeleted: result.totalDeleted,
          errorCount: result.errors.length,
        },
      );

      return {
        message: result.success
          ? `Category synchronization completed successfully for: ${categoryNames.join(', ')}`
          : `Category synchronization completed with errors for: ${categoryNames.join(', ')}`,
        categories: categoryNames,
        ...result,
      };
    } catch (error) {
      this.logger.error('Category sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Incremental sync for specific categories
   */
  @Post('sync/incremental/categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Incremental synchronization for specific categories',
    description:
      'Syncs only products from specified categories that have been modified since the last sync. ' +
      'More efficient for regular updates of specific product lines.',
  })
  @ApiQuery({
    name: 'categories',
    required: true,
    description: 'Comma-separated list of category names to sync',
    example: 'Lermao,Trà Phượng Hoàng',
  })
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'ISO date string to sync products modified since this date',
    example: '2024-01-01T00:00:00Z',
  })
  @ApiResponse({
    status: 200,
    description: 'Incremental category synchronization completed successfully',
  })
  async incrementalSyncByCategories(
    @Query('categories') categories: string,
    @Query('since') since?: string,
  ) {
    this.logger.log(
      `Category-filtered incremental sync requested for: ${categories}`,
    );

    if (!categories || categories.trim() === '') {
      throw new BadRequestException('Categories parameter is required');
    }

    const categoryNames = categories
      .split(',')
      .map((cat) => cat.trim())
      .filter((cat) => cat.length > 0);

    if (categoryNames.length === 0) {
      throw new BadRequestException(
        'At least one valid category name is required',
      );
    }

    try {
      const result = await this.productService.incrementalSync(
        since,
        categoryNames,
      );

      this.logger.log(
        `Category incremental sync completed: ${result.success ? 'Success' : 'Failed'}`,
        {
          categories: categoryNames,
          totalSynced: result.totalSynced,
          errorCount: result.errors.length,
        },
      );

      return {
        message: result.success
          ? `Incremental synchronization completed successfully for: ${categoryNames.join(', ')}`
          : `Incremental synchronization completed with errors for: ${categoryNames.join(', ')}`,
        categories: categoryNames,
        since: since || 'auto-detected',
        ...result,
      };
    } catch (error) {
      this.logger.error('Category incremental sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Get available categories from KiotViet
   * This endpoint helps you discover what categories are available for filtering
   */
  @Get('sync/categories')
  @ApiOperation({
    summary: 'Get available categories from KiotViet',
    description:
      'Retrieves the list of all available categories from KiotViet. ' +
      'Use this to discover category names for filtering sync operations.',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              id: { type: 'number' },
            },
          },
        },
        totalCount: { type: 'number' },
      },
    },
  })
  async getAvailableCategories() {
    this.logger.log('Fetching available categories from KiotViet');

    try {
      const categoryMap =
        await this.productService['kiotVietService'].fetchCategories();

      const categories = Array.from(categoryMap.entries()).map(
        ([name, id]) => ({
          name,
          id,
        }),
      );

      // Sort categories alphabetically for easier browsing
      categories.sort((a, b) => a.name.localeCompare(b.name));

      this.logger.log(
        `Retrieved ${categories.length} categories from KiotViet`,
      );

      return {
        categories,
        totalCount: categories.length,
        message: `Found ${categories.length} categories in KiotViet`,
      };
    } catch (error) {
      this.logger.error('Failed to fetch categories:', error.message);
      throw error;
    }
  }

  // Add this new endpoint to src/product/product.controller.ts

  /**
   * Clean database and sync only specific categories
   * This is the safest way to transition from a full catalog to category-filtered products
   */
  @Post('sync/clean-and-sync-categories') // <-- The route decorator
  @HttpCode(HttpStatus.OK) // <-- HTTP status decorator
  @ApiOperation({
    // <-- Description of what this endpoint does
    summary: 'Clean database and sync only specific categories',
    description:
      'Safely removes ALL existing products from the database and then syncs only products from the specified categories. ' +
      'This is useful when transitioning from a full product catalog to a category-filtered approach. ' +
      'Use this when you want your database to contain ONLY products from specific categories.',
  })
  @ApiQuery({
    // <-- Describes the query parameters
    name: 'categories',
    required: true,
    description: 'Comma-separated list of category names to sync',
    example: 'Lermao,Trà Phượng Hoàng',
  })
  @ApiResponse({
    // <-- HERE IS WHERE IT GOES!
    status: 200, // <-- This describes the success response
    description:
      'Database cleaned and category synchronization completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        totalSynced: { type: 'number' },
        totalDeleted: { type: 'number' },
        cleanupInfo: {
          type: 'object',
          properties: {
            deletedProducts: { type: 'number' },
            deletedOrders: { type: 'number' },
            deletedReviews: { type: 'number' },
            deletedRelations: { type: 'number' },
          },
        },
        categories: { type: 'array', items: { type: 'string' } },
        summary: {
          type: 'object',
          properties: {
            beforeSync: { type: 'number' },
            afterSync: { type: 'number' },
            newProducts: { type: 'number' },
            updatedProducts: { type: 'number' },
            deletedProducts: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    // <-- You can have multiple @ApiResponse decorators
    status: 400, // <-- This describes error responses
    description: 'Bad request - Invalid category names or operation failed',
  })
  async cleanAndSyncCategories(@Query('categories') categories: string) {
    // <-- THE ACTUAL METHOD IMPLEMENTATION GOES HERE
    this.logger.log(`Clean and sync requested for categories: ${categories}`);

    if (!categories || categories.trim() === '') {
      throw new BadRequestException(
        'Categories parameter is required. Example: ?categories=Lermao,Trà Phượng Hoàng',
      );
    }

    // Parse and validate category names
    const categoryNames = categories
      .split(',')
      .map((cat) => cat.trim())
      .filter((cat) => cat.length > 0);

    if (categoryNames.length === 0) {
      throw new BadRequestException(
        'At least one valid category name is required',
      );
    }

    this.logger.log(
      `Parsed ${categoryNames.length} categories: ${categoryNames.join(', ')}`,
    );

    try {
      const result =
        await this.productService.cleanAndSyncCategories(categoryNames);

      this.logger.log(
        `Clean and sync completed: ${result.success ? 'Success' : 'Failed'}`,
        {
          categories: categoryNames,
          deletedOldProducts: result.cleanupInfo.deletedProducts,
          newProductsSynced: result.totalSynced,
          errorCount: result.errors.length,
        },
      );

      return {
        message: result.success
          ? `Database cleaned and successfully synced ${result.totalSynced} products from categories: ${categoryNames.join(', ')}`
          : `Database cleaned but sync completed with ${result.errors.length} errors for categories: ${categoryNames.join(', ')}`,
        categories: categoryNames,
        operation: 'clean-and-sync',
        ...result,
      };
    } catch (error) {
      this.logger.error('Clean and sync operation failed:', error.message);
      throw error;
    }
  }

  @Get('get-by-id/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product found successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findById(@Param('id') id: string) {
    return this.productService.findById(+id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search products with pagination' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: 'Number of items per page',
    example: 10,
  })
  @ApiQuery({
    name: 'pageNumber',
    required: false,
    description: 'Page number (0-based)',
    example: 0,
  })
  @ApiQuery({
    name: 'title',
    required: false,
    description: 'Search by product title',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Search by product type',
  })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
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

  @Get('order/admin-search')
  @ApiOperation({ summary: 'Search orders for admin panel' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  searchOrders(@Query() searchParams: OrderSearchDto) {
    return this.productService.searchOrders(searchParams);
  }

  @Patch('order/:id/status/:status')
  @ApiOperation({ summary: 'Change order status' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiParam({ name: 'status', description: 'New status' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  changeOrderStatus(@Param('id') id: string, @Param('status') status: string) {
    return this.productService.changeOrderStatus(id, status);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new product',
    description:
      'Creates a new product in the local database. Note: This will not sync to KiotViet automatically.',
  })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid product data' })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an existing product',
    description:
      'Updates a product in the local database. Note: This will not sync to KiotViet automatically.',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(+id, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a product',
    description:
      'Deletes a product from the local database. Note: This will not sync to KiotViet automatically.',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  remove(@Param('id') id: string) {
    return this.productService.remove(+id);
  }

  @Get('cache-list-products')
  @ApiOperation({ summary: 'Get products by IDs for caching' })
  @ApiQuery({
    name: 'productIds',
    description: 'Comma-separated list of product IDs',
    example: '1,2,3,4,5',
  })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async getProductsByIds(@Query('productIds') productIds: string) {
    return this.productService.getProductsByIds(productIds);
  }
}
