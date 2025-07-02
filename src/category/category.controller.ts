// src/category/category.controller.ts - FIXED VERSION
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
// FIXED: Import types from the shared types file
import { KiotVietCategory } from '../product/types/kiotviet.types';

@ApiTags('category')
@Controller('category')
export class CategoryController {
  private readonly logger = new Logger(CategoryController.name);

  constructor(private readonly categoryService: CategoryService) {}

  // NEW: KiotViet Category Sync Endpoints

  @Post('sync/full')
  @ApiOperation({
    summary: 'Sync all categories from KiotViet to local database',
  })
  @ApiResponse({
    status: 200,
    description: 'Category synchronization completed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Category synchronization failed',
  })
  async fullCategorySync() {
    try {
      this.logger.log('Starting full category sync from KiotViet');
      const result = await this.categoryService.syncCategoriesFromKiotViet();

      return {
        message: result.success
          ? 'Category synchronization completed successfully'
          : 'Category synchronization completed with errors',
        ...result,
      };
    } catch (error) {
      this.logger.error('Full category sync failed:', error.message);
      throw new BadRequestException(`Category sync failed: ${error.message}`);
    }
  }

  @Post('sync/clean-and-sync')
  @ApiOperation({
    summary: 'Clean database and sync all categories from KiotViet',
    description:
      'WARNING: This will delete all existing categories and their relationships, then sync fresh data from KiotViet',
  })
  @ApiResponse({
    status: 200,
    description: 'Database cleaned and categories synced successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Clean and sync operation failed',
  })
  async cleanAndSyncCategories() {
    try {
      this.logger.log(
        'Starting clean database and category sync from KiotViet',
      );
      const result = await this.categoryService.cleanAndSyncCategories();

      return {
        message: result.success
          ? `Database cleaned and successfully synced ${result.totalSynced} categories from KiotViet`
          : `Database cleaned but sync completed with ${result.errors.length} errors`,
        operation: 'clean-and-sync',
        ...result,
      };
    } catch (error) {
      this.logger.error('Clean and sync operation failed:', error.message);
      throw new BadRequestException(`Clean and sync failed: ${error.message}`);
    }
  }

  @Get('sync/test-connection')
  @ApiOperation({ summary: 'Test connection to KiotViet API' })
  @ApiResponse({
    status: 200,
    description: 'Connection test result',
  })
  async testKiotVietConnection() {
    try {
      // We'll access the KiotVietService through the CategoryService
      const result =
        await this.categoryService['kiotVietService'].testConnection();

      if (result.success) {
        this.logger.log('KiotViet connection test successful');
      } else {
        this.logger.warn('KiotViet connection test failed:', result.message);
      }

      return result;
    } catch (error) {
      this.logger.error('Connection test error:', error.message);
      throw new BadRequestException(`Connection test failed: ${error.message}`);
    }
  }

  @Get('sync/preview')
  @ApiOperation({
    summary: 'Preview KiotViet category hierarchy without syncing',
    description:
      'Get a preview of the category structure that would be synced from KiotViet',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns KiotViet category hierarchy preview',
  })
  // FIXED: Explicit return type to resolve the export issue
  async previewKiotVietCategories(): Promise<{
    message: string;
    preview: boolean;
    categories: KiotVietCategory[];
    stats: {
      totalCategories: number;
      rootCategories: number;
      categoriesWithChildren: number;
      maxDepth: number;
    };
  }> {
    try {
      const result = await this.categoryService.getKiotVietCategoryHierarchy();

      this.logger.log(
        `Preview: Found ${result.stats.totalCategories} categories in KiotViet`,
      );

      return {
        message: `Found ${result.stats.totalCategories} categories in KiotViet hierarchy`,
        preview: true,
        ...result,
      };
    } catch (error) {
      this.logger.error(
        'Failed to preview KiotViet categories:',
        error.message,
      );
      throw new BadRequestException(`Preview failed: ${error.message}`);
    }
  }

  @Get('sync/status')
  @ApiOperation({ summary: 'Get category sync status and statistics' })
  @ApiResponse({
    status: 200,
    description: 'Returns current sync status and database statistics',
  })
  async getCategorySyncStatus() {
    try {
      const totalLocalCategories =
        await this.categoryService['prisma'].category.count();
      const totalProductRelations =
        await this.categoryService['prisma'].category.count();

      let kiotVietConfigured = false;
      let kiotVietCategoryCount = 0;
      let configMessage = '';

      try {
        const connectionTest =
          await this.categoryService['kiotVietService'].testConnection();
        kiotVietConfigured = connectionTest.success;
        configMessage = connectionTest.message;

        if (connectionTest.success) {
          const preview =
            await this.categoryService.getKiotVietCategoryHierarchy();
          kiotVietCategoryCount = preview.stats.totalCategories;
        }
      } catch (error) {
        this.logger.warn('KiotViet not configured:', error.message);
        configMessage = `KiotViet configuration error: ${error.message}`;
      }

      return {
        localDatabase: {
          totalCategories: totalLocalCategories,
          totalProductRelations: totalProductRelations,
        },
        kiotViet: {
          configured: kiotVietConfigured,
          totalCategories: kiotVietCategoryCount,
          message: configMessage,
        },
        syncEnabled: true,
        lastSyncAttempt: null, // You can implement this if needed
      };
    } catch (error) {
      this.logger.error('Failed to get sync status:', error.message);
      throw new BadRequestException(
        `Failed to get sync status: ${error.message}`,
      );
    }
  }

  // EXISTING ENDPOINTS (keeping all your original functionality)

  @Post()
  @ApiOperation({ summary: 'Create a new category manually' })
  postCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.postCategory(createCategoryDto);
  }

  @ApiOperation({ summary: 'Update category priorities/sorting order' })
  @ApiBody({ type: UpdateCategoryDto })
  @Patch()
  updatePriorities(@Body() updateCategoryPrioritiesDto: UpdateCategoryDto) {
    // FIXED: Use correct type
    return this.categoryService.updatePriorities(
      updateCategoryPrioritiesDto.items,
    ); // FIXED: Pass .items
  }

  @Get('v2/get-all')
  @ApiOperation({ summary: 'Get all categories with pagination and hierarchy' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated categories with parent-child relationships',
  })
  getAllCategories(
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
    @Body() updateCategoryDto: Partial<CreateCategoryDto>, // FIXED: Use Partial<CreateCategoryDto>
  ) {
    return this.categoryService.update(+id, updateCategoryDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  remove(@Param('id') id: string) {
    return this.categoryService.remove(+id);
  }
}
