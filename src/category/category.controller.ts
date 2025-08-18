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
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('category')
@Controller('category')
export class CategoryController {
  private readonly logger = new Logger(CategoryController.name);

  constructor(private readonly categoryService: CategoryService) {}

  @Post('categories')
  async syncCategories() {
    try {
      this.logger.log('🗂️ Starting category sync...');

      await this.categoryService.syncAllCategories();

      return {
        success: true,
        message: 'Category sync completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Category sync failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new category manually' })
  postCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.postCategory(createCategoryDto);
  }

  @ApiOperation({ summary: 'Update category priorities/sorting order' })
  @ApiBody({ type: UpdateCategoryDto })
  @Patch()
  updatePriorities(@Body() updateCategoryPrioritiesDto: UpdateCategoryDto) {
    return this.categoryService.updatePriorities(
      updateCategoryPrioritiesDto.items,
    );
  }

  @Get('v2/get-all')
  @ApiOperation({
    summary: 'Get all custom categories (manual)',
    description:
      'Get manually created categories with pagination and hierarchy',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated custom categories',
  })
  getAllCustomCategories(
    @Query('pageSize') pageSize: string = '1000',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('parentId') parentId?: string,
  ) {
    return this.categoryService.getAllCategories({
      pageSize: parseInt(pageSize),
      pageNumber: parseInt(pageNumber),
      parentId,
    });
  }

  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category information' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: Partial<CreateCategoryDto>,
  ) {
    return this.categoryService.update(+id, updateCategoryDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  remove(@Param('id') id: string) {
    return this.categoryService.remove(+id);
  }

  // @Get("get-all")
}
