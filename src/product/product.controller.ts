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
import { CurrentSiteCode } from '../common/decorators/site-code.decorator';

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

  // ============================
  // SYNC (giữ nguyên — không filter site)
  // ============================
  @Post('products')
  async syncProducts() {
    try {
      this.logger.log('Starting product sync...');
      await this.productService.syncAllProducts();
      return {
        success: true,
        message: 'Product sync completed',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Product sync failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ============================
  // CMS: GET ALL — filter site
  // ============================
  @Get('cms/get-all')
  @ApiOperation({ summary: 'Get all products for CMS with site config' })
  getCMSProducts(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('categoryId') categoryId?: string,
    @Query('is_visible') is_visible?: string,
    @Query('orderBy') orderBy?: string,
    @Query('isDesc') isDesc?: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.productService.searchForCMSWithSiteConfig(
      {
        pageSize: +pageSize,
        pageNumber: +pageNumber,
        title,
        categoryId: categoryId ? +categoryId : undefined,
        visibilityFilter:
          is_visible !== undefined ? is_visible === 'true' : undefined,
        orderBy,
        isDesc: isDesc === 'true',
        includeHidden: true,
      },
      siteCode,
    );
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

  // ============================
  // CMS: UPSERT SITE CONFIG
  // ============================
  @Patch(':id/site-config')
  @ApiOperation({
    summary:
      'Update product config for current site (category, description, visibility, etc.)',
  })
  updateSiteConfig(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.productService.upsertProductSiteConfig(+id, siteCode, body);
  }

  // ============================
  // CMS: TOGGLE VISIBILITY per site
  // ============================
  @Patch('site-toggle-visibility/:id')
  @ApiOperation({ summary: 'Toggle product visibility for current site' })
  toggleSiteVisibility(
    @Param('id') id: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.productService.toggleVisibilityForSite(+id, siteCode);
  }

  @Get('client/get-all')
  @ApiOperation({ summary: 'Get all visible products for client' })
  getClientProducts(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('categoryId') categoryId?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('excludeProductId') excludeProductId?: string,
    @Query('randomize') randomize?: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    const filters: any = {
      pageSize: +pageSize,
      pageNumber: +pageNumber,
      title,
      visibilityFilter: true,
      includeHidden: false,
    };

    if (categoryIds) {
      filters.categoryIds = categoryIds
        .split(',')
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));
    } else if (categoryId) {
      filters.categoryId = +categoryId;
    }

    if (excludeProductId) filters.excludeProductId = +excludeProductId;
    if (randomize === 'true') filters.randomize = true;

    return this.productService.searchForCMSWithSiteConfig(filters, siteCode);
  }

  @Get('client/get-all-product-list')
  @ApiOperation({ summary: 'Get all visible products (simplified)' })
  getAllProductsForClient(@CurrentSiteCode() siteCode?: string) {
    return this.productService.getAllProductsForClientBySite(siteCode);
  }

  // ============================
  // CLIENT: FIND BY SLUG — per site
  // ============================
  @Get('client/find-by-slug/:slug')
  @ApiOperation({ summary: 'Find product by slug for current site' })
  findProductBySlug(
    @Param('slug') slug: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.productService.findBySlugForSite(slug, siteCode);
  }

  // ============================
  // CLIENT: BY CATEGORY SLUG PATH — per site
  // ============================
  @Get('client/by-category-slug/:slugPath')
  @ApiOperation({
    summary: 'Get products by category slug path for current site',
  })
  async getProductsByCategorySlugPath(
    @Param('slugPath') slugPath: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    if (!slugPath) throw new BadRequestException('slugPath is required');

    const slugArray = slugPath
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (slugArray.length === 0)
      throw new BadRequestException('slugPath must contain at least one slug');

    const categoryData = await this.categoryService.resolveCategoryPath(
      slugArray,
      siteCode,
    );
    if (!categoryData || !categoryData.id) {
      throw new NotFoundException(
        `Category not found for path: ${slugArray.join('/')}`,
      );
    }

    // Lấy products thông qua product_site_config
    const products = await this.productService.getProductsByCategoryForSite(
      categoryData.id,
      siteCode,
    );

    return {
      success: true,
      data: {
        products,
        category: categoryData,
        totalProducts: products.length,
      },
    };
  }

  // ============================
  // CLIENT: FEATURED BY CATEGORIES — per site
  // ============================
  @Get('client/featured-by-categories')
  @ApiOperation({
    summary: 'Get featured products grouped by categories for current site',
  })
  getFeaturedProductsByCategories(@CurrentSiteCode() siteCode?: string) {
    return this.productService.getFeaturedProductsByCategoriesForSite(siteCode);
  }

  // ============================
  // CLIENT: FIND ID BY SLUG
  // ============================
  @Get('client/find-id-by-slug')
  findIdBySlug(
    @Query('slug') slug: string,
    @Query('categorySlug') categorySlug: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.productService.findIdBySlugForSite(
      slug,
      categorySlug,
      siteCode,
    );
  }

  // ============================
  // CÁC ENDPOINT CŨ — giữ nguyên cho backward compatibility
  // ============================
  @Patch(':id/category')
  @ApiOperation({ summary: 'Update product category (legacy)' })
  updateCategory(
    @Param('id') id: string,
    @Body() body: { category_id: number },
  ) {
    return this.productService.update(+id, { category_id: body.category_id });
  }

  @Get('search')
  search(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('categoryId') categoryId?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('is_visible') is_visible?: string,
    @Query('orderBy') orderBy?: string,
    @Query('isDesc') isDesc?: string,
  ) {
    const filters: any = { includeHidden: true };
    if (title) filters.title = title;
    if (categoryIds) {
      filters.categoryIds = categoryIds
        .split(',')
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));
    } else if (categoryId) {
      filters.categoryId = +categoryId;
    }
    if (is_visible !== undefined)
      filters.visibilityFilter = is_visible === 'true';
    if (orderBy) {
      filters.orderBy = orderBy;
      filters.isDesc = isDesc === 'true';
    }

    return this.productService.searchForCMS({
      pageSize: +pageSize,
      pageNumber: +pageNumber,
      ...filters,
    });
  }

  @Get('get-by-id/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  findOne(@Param('id') id: string, @CurrentSiteCode() siteCode?: string) {
    return this.productService.findOneWithSiteConfig(+id, siteCode);
  }

  @Post()
  @ApiOperation({ summary: 'Create product' })
  @UsePipes(new ValidationPipe({ transform: true }))
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product (shared fields)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(+id, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete product' })
  remove(@Param('id') id: string) {
    return this.productService.remove(+id);
  }

  @Patch('toggle-visibility/:id')
  @ApiOperation({ summary: 'Toggle product visibility (legacy)' })
  toggleVisibility(@Param('id') id: string) {
    return this.productService.toggleVisibility(+id);
  }

  @Post('generate-slugs')
  @ApiOperation({ summary: 'Generate slugs for existing products' })
  generateProductSlugs() {
    return this.productService.generateSlugsForExistingProducts();
  }

  @Post('client/find-by-slugs')
  async findBySlugs(
    @Body() body: { slugs: string[] },
    @CurrentSiteCode() siteCode?: string,
  ) {
    const products = await Promise.allSettled(
      body.slugs.map((slug) =>
        this.productService.findBySlugForSite(slug, siteCode),
      ),
    );
    return products
      .filter((r) => r.status === 'fulfilled')
      .map((r: any) => r.value);
  }
}
