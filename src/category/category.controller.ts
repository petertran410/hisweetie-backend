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
} from '@nestjs/common';
import { CategoryService } from './category.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateProductCategoryDto,
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

  @Post()
  @ApiOperation({
    summary: 'Create new category',
    description: 'Create a new category with optional parent category',
  })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid data' })
  @UsePipes(new ValidationPipe({ transform: true }))
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get('tree')
  @ApiOperation({
    summary: 'Get all categories in tree structure',
    description:
      'Retrieve all categories organized in hierarchical tree structure',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories tree fetched successfully',
  })
  getAllCategoriesTree() {
    return this.categoryService.getAllCategoriesTree();
  }

  @Get('flat')
  @ApiOperation({
    summary: 'Get all categories in flat list',
    description:
      'Retrieve all categories as flat list with hierarchy levels (for dropdowns)',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories list fetched successfully',
  })
  getCategoriesFlat() {
    return this.categoryService.getCategoriesFlat();
  }

  @Get('paginated')
  @ApiOperation({
    summary: 'Get categories with pagination',
    description:
      'Get categories with pagination support and optional parent filter',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: 'Items per page (default: 10)',
  })
  @ApiQuery({
    name: 'pageNumber',
    required: false,
    description: 'Page number (default: 0)',
  })
  @ApiQuery({
    name: 'parentId',
    required: false,
    description: 'Filter by parent category ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated categories fetched successfully',
  })
  getAllCategories(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('parentId') parentId?: string,
  ) {
    return this.categoryService.getAllCategories({
      pageSize: parseInt(pageSize),
      pageNumber: parseInt(pageNumber),
      parentId,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get category by ID',
    description: 'Retrieve a specific category with its products',
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category fetched successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update category',
    description:
      'Update category information including name, description, parent, and priority',
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid data' })
  @UsePipes(new ValidationPipe({ transform: true }))
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(+id, updateCategoryDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete category',
    description:
      'Delete a category (only if it has no products or child categories)',
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete - category has products or children',
  })
  remove(@Param('id') id: string) {
    return this.categoryService.remove(+id);
  }

  @Get('for-cms')
  @ApiOperation({
    summary: 'Get categories for CMS dropdown/selection',
    description: 'Get all categories in flat format for CMS product assignment',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories for CMS selection',
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
              displayName: { type: 'string' },
              level: { type: 'number' },
              parent_id: { type: 'number', nullable: true },
              productCount: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getCategoriesForCMS() {
    return this.categoryService.getCategoriesForCMS();
  }
}
