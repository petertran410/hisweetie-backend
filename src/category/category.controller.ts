// src/category/category.controller.ts - SỬA ROUTE ORDER
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

  // ✅ ĐẶT CÁC ROUTE CỐ ĐỊNH TRƯỚC ROUTE ĐỘNG
  @Get('tree')
  @ApiOperation({
    summary: 'Get all categories in tree structure',
    description:
      'Retrieve all categories organized in hierarchical tree structure',
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
  getCategoriesFlat() {
    return this.categoryService.getCategoriesFlat();
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
  @ApiOperation({
    summary: 'Get categories with pagination',
    description:
      'Get categories with pagination support and optional parent filter',
  })
  getAllCategories(
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
}
