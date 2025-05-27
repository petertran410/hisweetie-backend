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
import { OrderSearchDto } from './dto/order-search.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';

@ApiTags('product')
@Controller('product')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);
  prisma = new PrismaClient();

  constructor(private readonly productService: ProductService) {}

  @Post('sync/full')
  async fullSync() {
    try {
      const result = await this.productService.forceFullSync();

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
  async incrementalSync(@Query('since') since?: string) {
    try {
      const result = await this.productService.incrementalSync(since);

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
      throw error;
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
      };
    } catch (error) {
      this.logger.error('Failed to get sync status:', error.message);
      throw error;
    }
  }

  @Post('sync/full/categories')
  async fullSyncByCategories(@Query('categories') categories: string) {
    if (!categories || categories.trim() === '') {
      throw new BadRequestException(
        'Categories parameter is required. Example: ?categories=Lermao,Trà Phượng Hoàng',
      );
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
      const result = await this.productService.forceFullSync(categoryNames);

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

  @Post('sync/incremental/categories')
  async incrementalSyncByCategories(
    @Query('categories') categories: string,
    @Query('since') since?: string,
  ) {
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

  @Get('sync/categories')
  async getAvailableCategories() {
    try {
      const categoryMap =
        await this.productService['kiotVietService'].fetchCategories();

      const categories = Array.from(categoryMap.entries()).map(
        ([name, id]) => ({
          name,
          id,
        }),
      );

      categories.sort((a, b) => a.name.localeCompare(b.name));

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

  @Post('sync/clean-and-sync-categories')
  async cleanAndSyncCategories(@Query('categories') categories: string) {
    if (!categories || categories.trim() === '') {
      throw new BadRequestException(
        'Categories parameter is required. Example: ?categories=Lermao,Trà Phượng Hoàng',
      );
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
      const result =
        await this.productService.cleanAndSyncCategories(categoryNames);

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

  @Get('order/admin-search')
  searchOrders(@Query() searchParams: OrderSearchDto) {
    return this.productService.searchOrders(searchParams);
  }

  @Patch('order/:id/status/:status')
  changeOrderStatus(@Param('id') id: string, @Param('status') status: string) {
    return this.productService.changeOrderStatus(id, status);
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

  @Get('by-categories')
  @ApiOperation({
    summary:
      'Get products from specific categories (Trà Phượng Hoàng and Lermao) with type filtering',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns paginated products from specified categories and types',
  })
  async getProductsByCategories(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
  ) {
    try {
      return await this.productService.getProductsBySpecificCategories({
        pageSize: parseInt(pageSize),
        pageNumber: parseInt(pageNumber),
        title,
        categoryIds: [],
        allowedTypes: [],
      });
    } catch (error) {
      this.logger.error('Failed to get products by categories:', error.message);
      throw new BadRequestException(`Failed to get products: ${error.message}`);
    }
  }

  // 2. Update src/product/product.service.ts
  // Add this method to the ProductService class
  async getProductsBySpecificCategories(params: {
    pageSize: number;
    pageNumber: number;
    title?: string;
  }) {
    const { pageSize, pageNumber, title } = params;

    // Category IDs for "Trà Phượng Hoàng" and "Lermao" from your database
    const categoryIds = [
      BigInt(1), // Trà phượng hoàng
      BigInt(2), // Gấu Lermao
      BigInt(2205374), // Trà Phượng Hoàng
      BigInt(2205381), // Lermao
    ];

    // Allowed product types
    const allowedTypes = [
      'Bột',
      'hàng sãn xuất',
      'Mứt Sốt',
      'Siro',
      'Topping',
      'Khác (Lermao)',
      'Khác (Trà Phượng Hoàng)',
      'Gói', // Add this based on your product.txt data
      'Chai', // Add this based on your product.txt data
      'Cái', // Add this based on your product.txt data
      'Hộp', // Add this based on your product.txt data
      'Túi', // Add this based on your product.txt data
      'piece', // Add this based on your product.txt data
    ];

    try {
      // First, get all product IDs that belong to the specified categories
      const productCategoryRelations =
        await this.prisma.product_categories.findMany({
          where: {
            categories_id: {
              in: categoryIds,
            },
          },
          select: {
            product_id: true,
          },
        });

      const productIds = [
        ...new Set(productCategoryRelations.map((rel) => rel.product_id)),
      ];

      if (productIds.length === 0) {
        this.logger.log('No products found for specified categories');
        return {
          content: [],
          totalElements: 0,
          pageable: {
            pageNumber,
            pageSize,
          },
        };
      }

      // Build where clause for products
      const where: any = {
        id: {
          in: productIds,
        },
      };

      // Only filter by type if the product type is in our allowed list
      // This prevents filtering out products with different type values
      const whereWithType: any = {
        ...where,
        type: {
          in: allowedTypes,
        },
      };

      if (title) {
        where.title = { contains: title };
        whereWithType.title = { contains: title };
      }

      // Try to get count with type filter first
      let totalElements = await this.prisma.product.count({
        where: whereWithType,
      });
      let useTypeFilter = true;

      // If no products found with type filter, try without it
      if (totalElements === 0) {
        totalElements = await this.prisma.product.count({ where });
        useTypeFilter = false;
        this.logger.log(
          'No products found with type filter, showing all products from categories',
        );
      }

      const products = await this.prisma.product.findMany({
        where: useTypeFilter ? whereWithType : where,
        skip: pageNumber * pageSize,
        take: pageSize,
        orderBy: { created_date: 'desc' },
        include: {
          product_categories: {
            include: {
              category: true,
            },
          },
        },
      });

      const content = products.map((product) => {
        let imagesUrl = [];
        try {
          imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
        } catch (error) {
          this.logger.warn(
            `Failed to parse images_url for product ${product.id}:`,
            error,
          );
        }

        return {
          id: product.id.toString(),
          title: product.title,
          price: product.price ? Number(product.price) : null,
          quantity: product.quantity ? Number(product.quantity) : null,
          description: product.description,
          imagesUrl,
          generalDescription: product.general_description || '',
          instruction: product.instruction || '',
          isFeatured: product.is_featured || false,
          featuredThumbnail: product.featured_thumbnail,
          recipeThumbnail: product.recipe_thumbnail,
          type: product.type,
          createdDate: product.created_date,
          updatedDate: product.updated_date,
          ofCategories: product.product_categories.map((pc) => ({
            id: pc.categories_id.toString(),
            name: pc.category?.name || '',
          })),
        };
      });

      this.logger.log(`Found ${totalElements} products for categories`);

      return {
        content,
        totalElements,
        pageable: {
          pageNumber,
          pageSize,
        },
      };
    } catch (error) {
      this.logger.error('Error in getProductsBySpecificCategories:', error);
      throw error;
    }
  }
}
