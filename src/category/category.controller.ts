// src/category/category.controller.ts
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
  UsePipes,
  ValidationPipe,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/create-category.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentSiteCode } from '../common/decorators/site-code.decorator';

@ApiTags('category')
@Controller('category')
export class CategoryController {
  private readonly logger = new Logger(CategoryController.name);

  constructor(private readonly categoryService: CategoryService) {}

  @Get('dropdown')
  @ApiOperation({ summary: 'Get categories for dropdown' })
  async getCategoriesForDropdown(@CurrentSiteCode() siteCode: string) {
    return this.categoryService.getCategoriesForDropdown(siteCode);
  }

  @Get('for-cms')
  @ApiOperation({ summary: 'Get all categories for CMS' })
  async getCategoriesForCMS(@CurrentSiteCode() siteCode: string) {
    return this.categoryService.getCategoriesForCMS(siteCode);
  }

  @Get('paginated')
  @ApiOperation({ summary: 'Get paginated categories for CMS' })
  getCategoriesForCMSPaginated(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('name') name?: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.categoryService.getAllCategories(
      {
        pageSize: parseInt(pageSize),
        pageNumber: parseInt(pageNumber),
        name,
      },
      siteCode,
    );
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get categories tree' })
  getTree(@CurrentSiteCode() siteCode: string) {
    return this.categoryService.getAllCategoriesTree(siteCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category detail' })
  findOne(@Param('id') id: string, @CurrentSiteCode() siteCode: string) {
    return this.categoryService.findOne(+id, siteCode);
  }

  @Post()
  @ApiOperation({ summary: 'Create category' })
  @UsePipes(new ValidationPipe({ transform: true }))
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.categoryService.create(createCategoryDto, siteCode);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category' })
  @UsePipes(new ValidationPipe({ transform: true }))
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.categoryService.update(+id, updateCategoryDto, siteCode);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete category' })
  remove(@Param('id') id: string, @CurrentSiteCode() siteCode: string) {
    return this.categoryService.remove(+id, siteCode);
  }

  @Post('recalculate-hierarchy')
  @ApiOperation({ summary: 'Recalculate category hierarchy' })
  async recalculateHierarchy(@CurrentSiteCode() siteCode: string) {
    await this.categoryService.recalculateHierarchy(siteCode);
    return { success: true, message: 'Category hierarchy recalculated' };
  }

  @Post('generate-slugs')
  @ApiOperation({ summary: 'Generate slugs for existing categories' })
  async generateCategorySlugs(@CurrentSiteCode() siteCode: string) {
    return this.categoryService.generateSlugsForExistingCategories(siteCode);
  }

  @Post('resolve-path')
  @ApiOperation({ summary: 'Resolve category slug path to hierarchy' })
  async resolveCategoryPath(
    @Body() body: { slugPath: string[] },
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.categoryService.resolveCategoryPath(body.slugPath, siteCode);
  }

  @Post('build-path')
  @ApiOperation({ summary: 'Build slug path from category IDs' })
  async buildCategoryPath(@Body() body: { categoryIds: number[] }) {
    return this.categoryService.buildCategoryPath(body.categoryIds);
  }

  @Get('client/find-by-slug/:slug')
  async findBySlugForClient(
    @Param('slug') slug: string,
    @CurrentSiteCode() siteCode: string,
  ) {
    const category = await this.categoryService.findBySlug(slug, siteCode);
    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    return {
      id: Number(category.id),
      name: category.name,
      slug: category.slug,
      description: category.description,
    };
  }

  @Post('reassign-products')
  @ApiOperation({ summary: 'Reassign products from one category to another' })
  async reassignProducts(
    @Body() body: { fromCategoryId: number; toCategoryId?: number | null },
  ) {
    const { fromCategoryId, toCategoryId } = body;
    if (!fromCategoryId || isNaN(fromCategoryId)) {
      throw new BadRequestException('Invalid fromCategoryId');
    }
    return this.categoryService.reassignProducts(
      fromCategoryId,
      toCategoryId || null,
    );
  }
}
