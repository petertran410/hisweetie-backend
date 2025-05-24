// src/product/product.controller.ts
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
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('products')
@Controller('product')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(private readonly productService: ProductService) {}

  // ===== MAIN PRODUCT ENDPOINTS =====

  @Get('get-by-id/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product found successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findById(@Param('id') id: string) {
    return this.productService.findById(+id);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search products with pagination and filtering',
    description:
      'Search products from target categories (Trà Phượng Hoàng, Lermao) with specific product types',
  })
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
    name: 'productTypes',
    required: false,
    description:
      'Filter by product types (comma-separated). Valid types: Bột, hàng sãn xuất, Mứt Sốt, Siro, Topping, Khác (Lermao), Khác (Trà Phượng Hoàng)',
    example: 'Bột,Siro,Topping',
  })
  @ApiQuery({
    name: 'categoryNames',
    required: false,
    description:
      'Filter by category names (comma-separated). Valid categories: Trà Phượng Hoàng, Lermao',
    example: 'Trà Phượng Hoàng,Lermao',
  })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  search(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('productTypes') productTypes?: string,
    @Query('categoryNames') categoryNames?: string,
  ) {
    // Parse comma-separated values
    const productTypesList = productTypes
      ? productTypes
          .split(',')
          .map((type) => type.trim())
          .filter((type) => type.length > 0)
      : undefined;

    const categoryNamesList = categoryNames
      ? categoryNames
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      : undefined;

    return this.productService.search({
      pageSize: parseInt(pageSize),
      pageNumber: parseInt(pageNumber),
      title,
      productTypes: productTypesList,
      categoryNames: categoryNamesList,
    });
  }

  @Get('categories')
  @ApiOperation({
    summary: 'Get target categories for filtering',
    description: 'Returns only Trà Phượng Hoàng and Lermao categories',
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
              id: { type: 'string' },
              name: { type: 'string' },
              parentId: { type: 'string', nullable: true },
              parentName: { type: 'string', nullable: true },
            },
          },
        },
        totalCount: { type: 'number' },
      },
    },
  })
  async getAllCategories() {
    const categories = await this.productService.getAllCategories();
    return {
      categories,
      totalCount: categories.length,
    };
  }

  @Get('types-by-categories')
  @ApiOperation({
    summary: 'Get product types for target categories',
    description:
      'Returns all valid product types found within Trà Phượng Hoàng and Lermao categories',
  })
  @ApiQuery({
    name: 'categoryNames',
    required: true,
    description:
      'Comma-separated list of category names (Trà Phượng Hoàng, Lermao)',
    example: 'Trà Phượng Hoàng,Lermao',
  })
  @ApiResponse({
    status: 200,
    description: 'Product types retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        types: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              count: { type: 'number' },
              categoryName: { type: 'string' },
            },
          },
        },
        totalTypes: { type: 'number' },
      },
    },
  })
  async getProductTypesByCategories(
    @Query('categoryNames') categoryNames: string,
  ) {
    if (!categoryNames) {
      throw new BadRequestException('categoryNames parameter is required');
    }

    const categoryNamesList = categoryNames
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (categoryNamesList.length === 0) {
      throw new BadRequestException(
        'At least one valid category name is required',
      );
    }

    return this.productService.getProductTypesByCategories(categoryNamesList);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new product',
    description:
      'Creates a new product. Product type must be one of the valid types and can only be linked to target categories.',
  })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid product data or type' })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an existing product',
    description:
      'Updates a product. Product type must be one of the valid types and can only be linked to target categories.',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 400, description: 'Invalid product data or type' })
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(+id, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a product',
    description: 'Deletes a product from the database',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  remove(@Param('id') id: string) {
    return this.productService.remove(+id);
  }

  // ===== UTILITY ENDPOINTS =====

  @Get('valid-types')
  @ApiOperation({
    summary: 'Get all valid product types',
    description:
      'Returns the list of valid product types that can be assigned to products',
  })
  @ApiResponse({
    status: 200,
    description: 'Valid product types retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        types: {
          type: 'array',
          items: { type: 'string' },
        },
        totalCount: { type: 'number' },
      },
    },
  })
  getValidTypes() {
    const validTypes = this.productService.getValidProductTypes();

    return {
      types: validTypes,
      totalCount: validTypes.length,
      description: 'Valid product types for target categories',
    };
  }

  @Get('target-categories')
  @ApiOperation({
    summary: 'Get target category names',
    description:
      'Returns the target category names that this system focuses on',
  })
  @ApiResponse({
    status: 200,
    description: 'Target categories retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: { type: 'string' },
        },
        totalCount: { type: 'number' },
      },
    },
  })
  getTargetCategories() {
    const targetCategories = this.productService.getTargetCategories();

    return {
      categories: targetCategories,
      totalCount: targetCategories.length,
      description: 'Target categories for this product management system',
    };
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Get product summary statistics',
    description: 'Returns summary statistics for products in target categories',
  })
  @ApiResponse({
    status: 200,
    description: 'Product summary retrieved successfully',
  })
  async getProductSummary() {
    try {
      // Get total products in target categories
      const searchResult = await this.productService.search({
        pageSize: 1,
        pageNumber: 0,
        categoryNames: ['Trà Phượng Hoàng', 'Lermao'],
      });

      // Get product types breakdown
      const typesResult = await this.productService.getProductTypesByCategories(
        ['Trà Phượng Hoàng', 'Lermao'],
      );

      // Get categories info
      const categoriesResult = await this.productService.getAllCategories();

      return {
        totalProducts: searchResult.totalElements,
        availableTypes: searchResult.availableTypes,
        typeBreakdown: typesResult.types,
        categories: categoriesResult,
        summary: {
          totalCategories: categoriesResult.length,
          totalProductTypes: typesResult.totalTypes,
          lastUpdated: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('Failed to get product summary:', error.message);
      throw error;
    }
  }
}
