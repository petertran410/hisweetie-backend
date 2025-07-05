// src/pages/pages.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PagesService } from './pages.service';
import { CreatePagesDto } from './dto/create-pages.dto';
import { UpdatePagesDto } from './dto/update-pages.dto';
import { SearchPagesDto } from './dto/search-pages.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('pages')
@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  // ================================
  // ADMIN ENDPOINTS
  // ================================

  @Post()
  @ApiOperation({ summary: 'Create a new page' })
  @ApiResponse({
    status: 201,
    description: 'Page has been successfully created',
  })
  @UsePipes(new ValidationPipe())
  create(@Body() createPagesDto: CreatePagesDto) {
    return this.pagesService.create(createPagesDto);
  }

  @Get('admin/get-all')
  @ApiOperation({
    summary: 'Get all pages for admin with pagination and search',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated pages list for admin',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  findAllForAdmin(@Query() searchDto: SearchPagesDto) {
    return this.pagesService.getForAdmin(searchDto);
  }

  @Get('admin/:id')
  @ApiOperation({ summary: 'Get page by ID for admin' })
  @ApiParam({ name: 'id', description: 'Page ID' })
  @ApiResponse({ status: 200, description: 'Returns page details for admin' })
  findOneForAdmin(@Param('id') id: string) {
    return this.pagesService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update page' })
  @ApiParam({ name: 'id', description: 'Page ID' })
  @ApiResponse({
    status: 200,
    description: 'Page has been successfully updated',
  })
  @UsePipes(new ValidationPipe())
  update(@Param('id') id: string, @Body() updatePagesDto: UpdatePagesDto) {
    return this.pagesService.update(+id, updatePagesDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete page' })
  @ApiParam({ name: 'id', description: 'Page ID' })
  @ApiResponse({
    status: 200,
    description: 'Page has been successfully deleted',
  })
  remove(@Param('id') id: string) {
    return this.pagesService.remove(+id);
  }

  // ================================
  // CLIENT ENDPOINTS
  // ================================

  @Get('client/by-slug/:slug')
  @ApiOperation({
    summary: 'Get page by slug for client',
    description: 'Get page content by slug for public viewing',
  })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiResponse({ status: 200, description: 'Returns page content for client' })
  findBySlugForClient(@Param('slug') slug: string) {
    return this.pagesService.findBySlug(slug);
  }

  @Get('client/hierarchy')
  @ApiOperation({
    summary: 'Get page hierarchy for client',
    description: 'Get hierarchical structure of pages for navigation',
  })
  @ApiQuery({
    name: 'parentSlug',
    description: 'Parent page slug',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Returns page hierarchy' })
  getHierarchyForClient(@Query('parentSlug') parentSlug?: string) {
    return this.pagesService.getPageHierarchy(parentSlug);
  }

  @Get('client/children')
  @ApiOperation({
    summary: 'Get child pages for client',
    description: 'Get child pages of a parent for navigation',
  })
  @ApiQuery({
    name: 'parentId',
    description: 'Parent page ID',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Returns child pages' })
  getChildrenForClient(@Query('parentId') parentId?: string) {
    const parent_id = parentId ? +parentId : null;
    return this.pagesService.getForClient(parent_id);
  }
}
