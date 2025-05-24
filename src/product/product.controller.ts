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
