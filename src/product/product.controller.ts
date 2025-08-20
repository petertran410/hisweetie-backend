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
  NotFoundException,
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
import { GetAllProductsResponseDto } from './dto/product-list-response.dto';
import { CategoryService } from 'src/category/category.service';
import { PrismaService } from 'src/prisma/prisma.service';

@ApiTags('product')
@Controller('product')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly kiotVietService: KiotVietService,
    private readonly categoryService: CategoryService,
    private readonly prismaService: PrismaService,
  ) {}

  @Post('products')
  async syncProducts() {
    try {
      this.logger.log('🗂️ Starting category sync...');

      await this.productService.syncAllProducts();

      return {
        success: true,
        message: 'Product sync completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Product sync failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Patch(':id/category')
  @ApiOperation({
    summary: 'Update product category',
    description:
      'Update the category assignment of a product (using custom category schema)',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        category_id: {
          type: 'number',
          description: 'Custom category ID (from category schema)',
          example: 5,
        },
      },
      required: ['category_id'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Product category updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Product or category not found' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateProductCategory(
    @Param('id') id: string,
    @Body() body: { category_id: number },
  ) {
    const productId = +id;
    const categoryId = body.category_id;

    const product = await this.productService.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updatedProduct = await this.prismaService.product.update({
      where: { id: BigInt(productId) },
      data: { category_id: categoryId ? BigInt(categoryId) : null },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    return {
      success: true,
      data: {
        productId: Number(updatedProduct.id),
        categoryId: categoryId,
        categoryName: updatedProduct.category?.name || null,
        productName: updatedProduct.title || updatedProduct.kiotviet_name,
      },
      message: 'Product category updated successfully',
    };
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
    summary: 'Get products by custom categories',
    description:
      'Get products filtered by custom categories (from category schema, not KiotViet)',
  })
  @ApiQuery({
    name: 'includeHidden',
    required: false,
    description: 'Include hidden products (for CMS only)',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by custom category ID',
  })
  getProductsByCategories(
    @Query('pageSize') pageSize: string = '12',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('categoryId') categoryId?: string,
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
      'Get all products for CMS with custom category management (not KiotViet categories)',
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
    description: 'Filter by custom category ID (from category schema)',
  })
  @ApiQuery({
    name: 'is_visible',
    required: false,
    description: 'Filter by visibility status',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns paginated products for CMS with custom category information',
  })
  getCMSProducts(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('categoryId') categoryId?: string,
    @Query('is_visible') is_visible?: string,
  ) {
    const filters: any = {
      includeHidden: true,
    };

    if (title) filters.title = title;
    if (categoryId) filters.categoryId = +categoryId;

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

  @Get('client/get-all')
  @ApiOperation({
    summary: 'Get products for client (public view)',
    description: 'Get visible products only for public viewing',
  })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'pageNumber', required: false })
  @ApiQuery({ name: 'title', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'subCategoryId', required: false })
  @ApiQuery({ name: 'orderBy', required: false })
  @ApiQuery({ name: 'isDesc', required: false })
  @ApiQuery({ name: 'is_visible', required: false })
  @ApiQuery({ name: 'kiotviet_description', required: false })
  getProductsForClient(
    @Query('pageSize') pageSize: string = '12',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subCategoryId') subCategoryId?: string,
    @Query('orderBy') orderBy?: string,
    @Query('isDesc') isDesc?: string,
    @Query('is_visible') is_visible?: string,
    @Query('kiotviet_description') kiotviet_description?: string,
  ) {
    const params: any = {
      pageSize: +pageSize,
      pageNumber: +pageNumber,
      is_visible: is_visible !== undefined ? is_visible === 'true' : true,
    };

    if (categoryId) params.categoryId = +categoryId;
    if (subCategoryId) params.subCategoryId = +subCategoryId;
    if (orderBy) params.orderBy = orderBy;
    if (isDesc !== undefined) params.isDesc = isDesc === 'true';
    if (title) params.title = title;
    if (kiotviet_description)
      params.kiotviet_description = kiotviet_description;

    return this.productService.getProductsByCategories(params);
  }

  @Get('client/get-all-product-list')
  @ApiOperation({
    summary: 'Get all visible products for client',
    description:
      'Retrieve all visible products with essential fields for frontend display',
  })
  @ApiResponse({
    status: 200,
    description: 'Products retrieved successfully',
    type: GetAllProductsResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async getAllProductsForClient() {
    return this.productService.getAllProductsForClient();
  }
}
