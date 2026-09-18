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
import { PosProductSyncService } from './pos-product-sync.service';
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
import { CurrentSiteCode } from '../common/decorators/site-code.decorator';

@ApiTags('product')
@Controller('product')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly posProductSyncService: PosProductSyncService,
    private readonly categoryService: CategoryService,
  ) {}

  // ============================
  // POS PRODUCT SYNC (global, no site filter)
  // ============================
  @Post('pos/sync')
  @ApiOperation({
    summary: 'Synchronize products and pricebook 22 from Hisweetie POS',
  })
  syncProductsFromPos() {
    return this.posProductSyncService.syncProducts();
  }

  @Get('pos/sync/status')
  @ApiOperation({ summary: 'Get Hisweetie POS product sync status' })
  getPosProductSyncStatus() {
    return this.posProductSyncService.getStatus();
  }

  // Deprecated compatibility alias for existing CMS callers.
  @Post('products')
  async syncProducts() {
    this.logger.warn(
      'Deprecated POST /product/products called; using POS product synchronization',
    );
    return this.posProductSyncService.syncProducts();
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
    summary: 'Deprecated KiotViet trademark sync endpoint',
    description:
      'KiotViet product synchronization is disabled. Use the POS product sync endpoint.',
  })
  syncTrademarksFromKiotViet() {
    this.logger.warn(
      'Deprecated KiotViet trademark sync requested; KiotViet product integration is disabled',
    );

    return {
      success: false,
      disabled: true,
      message:
        'KiotViet product synchronization is disabled. Use POS product synchronization instead.',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('kiotviet/test-connection')
  @ApiOperation({
    summary: 'Deprecated KiotViet connection test endpoint',
    description:
      'KiotViet product synchronization is disabled; this endpoint no longer calls KiotViet.',
  })
  testKiotVietConnection() {
    this.logger.warn(
      'Deprecated KiotViet connection test requested; no external KiotViet request was made',
    );

    return {
      success: false,
      disabled: true,
      message:
        'KiotViet product integration is disabled. Use POS product synchronization instead.',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('kiotviet/sync/status')
  @ApiOperation({
    summary: 'Deprecated KiotViet sync status endpoint',
    description:
      'Returns POS product sync status for backward compatibility and does not call KiotViet.',
  })
  getKiotVietSyncStatus() {
    this.logger.warn(
      'Deprecated KiotViet sync status requested; returning POS sync status',
    );

    return this.posProductSyncService.getStatus();
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
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.productService.update(
      +id,
      { category_id: body.category_id },
      siteCode,
    );
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
    @CurrentSiteCode() siteCode?: string,
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

    return this.productService.searchForCMSWithSiteConfig(
      {
        pageSize: +pageSize,
        pageNumber: +pageNumber,
        ...filters,
      },
      siteCode,
    );
  }

  @Get('get-by-id/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  findOne(@Param('id') id: string, @CurrentSiteCode() siteCode?: string) {
    return this.productService.findOneWithSiteConfig(+id, siteCode);
  }

  @Post()
  @ApiOperation({ summary: 'Create product' })
  @UsePipes(new ValidationPipe({ transform: true }))
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.productService.create(createProductDto, siteCode);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product (shared fields)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.productService.update(+id, updateProductDto, siteCode);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete product' })
  remove(@Param('id') id: string, @CurrentSiteCode() siteCode?: string) {
    return this.productService.remove(+id, siteCode);
  }

  @Patch('toggle-visibility/:id')
  @ApiOperation({ summary: 'Toggle product visibility (legacy)' })
  toggleVisibility(
    @Param('id') id: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.productService.toggleVisibility(+id, siteCode);
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
