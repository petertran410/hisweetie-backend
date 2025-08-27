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

@ApiTags('category')
@Controller('category')
export class CategoryController {
  private readonly logger = new Logger(CategoryController.name);

  constructor(private readonly categoryService: CategoryService) {}

  @Get('dropdown')
  @ApiOperation({
    summary: 'Get categories for dropdown components',
    description: 'Returns array format directly for UI dropdowns',
  })
  async getCategoriesForDropdown() {
    const result = await this.categoryService.getCategoriesForCMS();

    return result.data.map((cat) => ({
      id: cat.id,
      name: cat.name,
      displayName: cat.displayName || cat.name,
      level: cat.level || 0,
      parent_id: cat.parent_id,
    }));
  }

  @Get('for-cms')
  @ApiOperation({
    summary: 'Get all categories for CMS',
    description: 'Get all categories with full information for CMS management',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories for CMS fetched successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              parent_id: { type: 'number', nullable: true },
              priority: { type: 'number' },
              productCount: { type: 'number' },
              level: { type: 'number' },
              displayName: { type: 'string' },
              hasChildren: { type: 'boolean' },
              hasProducts: { type: 'boolean' },
            },
          },
        },
        total: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  async getCategoriesForCMS() {
    return this.categoryService.getCategoriesForCMS();
  }

  @Get('paginated')
  @ApiOperation({ summary: 'Get paginated categories for CMS' })
  getCategoriesForCMSPaginated(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('name') name?: string,
  ) {
    return this.categoryService.getAllCategories({
      pageSize: parseInt(pageSize),
      pageNumber: parseInt(pageNumber),
      name,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Create new category',
    description: 'Create a new category with optional parent category',
  })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid data' })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get category by ID',
    description: 'Retrieve a specific category with its products',
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  findOne(@Param('id') id: string) {
    const categoryId = parseInt(id);
    if (isNaN(categoryId)) {
      throw new BadRequestException('Invalid category ID');
    }
    return this.categoryService.findOne(categoryId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update category',
    description:
      'Update category information including name, description, parent, and priority',
  })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    const categoryId = parseInt(id);
    if (isNaN(categoryId)) {
      throw new BadRequestException('Invalid category ID');
    }
    return this.categoryService.update(categoryId, updateCategoryDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete category',
    description:
      'Delete a category (only if it has no products or child categories)',
  })
  remove(@Param('id') id: string) {
    const categoryId = parseInt(id);
    if (isNaN(categoryId)) {
      throw new BadRequestException('Invalid category ID');
    }
    return this.categoryService.remove(categoryId);
  }

  @Post('recalculate-hierarchy')
  @ApiOperation({
    summary: 'Recalculate category hierarchy',
    description: 'Manual trigger to recalculate all hierarchy fields',
  })
  async recalculateHierarchy() {
    await this.categoryService.recalculateHierarchy();
    return {
      success: true,
      message: 'Category hierarchy recalculated successfully',
    };
  }

  @Post('reassign-products')
  @ApiOperation({
    summary: 'Reassign products from one category to another',
    description:
      'Move all products from source category to destination category (or uncategorized)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fromCategoryId: { type: 'number', description: 'Source category ID' },
        toCategoryId: {
          type: 'number',
          nullable: true,
          description: 'Destination category ID (null for uncategorized)',
        },
      },
      required: ['fromCategoryId'],
    },
  })
  async reassignProducts(
    @Body() body: { fromCategoryId: number; toCategoryId?: number | null },
  ) {
    const { fromCategoryId, toCategoryId } = body;

    if (!fromCategoryId || isNaN(fromCategoryId)) {
      throw new BadRequestException('Invalid fromCategoryId');
    }

    if (
      toCategoryId !== null &&
      toCategoryId !== undefined &&
      isNaN(toCategoryId)
    ) {
      throw new BadRequestException('Invalid toCategoryId');
    }

    return this.categoryService.reassignProducts(
      fromCategoryId,
      toCategoryId || null,
    );
  }
}
