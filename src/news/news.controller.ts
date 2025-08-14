// src/news/news.controller.ts - UPDATED với endpoint tìm ID
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
  HttpCode,
} from '@nestjs/common';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { ClientNewsSearchDto } from './dto/client-news-search.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('get-all')
  findAll(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('title') title?: string,
    @Query('type') type?: string,
  ) {
    return this.newsService.findAll({
      pageSize: parseInt(pageSize),
      pageNumber: parseInt(pageNumber),
      title,
      type,
    });
  }

  @Get('client/get-all')
  @ApiOperation({ summary: 'Get paginated news for client (public view)' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated news list for public viewing',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  findAllForClient(@Query() searchDto: ClientNewsSearchDto) {
    return this.newsService.findAllForClient(searchDto);
  }

  // THÊM MỚI: Endpoint tìm ID từ slug và type
  @Get('client/find-id-by-slug')
  @ApiOperation({
    summary: 'Find news ID by slug and type for URL mapping',
    description: 'Returns news ID to support clean URLs without exposing IDs',
  })
  @ApiQuery({ name: 'slug', description: 'Article slug (from title)' })
  @ApiQuery({
    name: 'type',
    description: 'Article type (NEWS, KIEN_THUC_TRA, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns news ID for the given slug and type',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'News article ID' },
        title: {
          type: 'string',
          description: 'Article title for verification',
        },
      },
    },
  })
  findIdBySlug(@Query('slug') slug: string, @Query('type') type: string) {
    return this.newsService.findIdBySlug(slug, type);
  }

  @Get('client/article-sections')
  @ApiOperation({
    summary: 'Get article sections for main "Bài Viết" page',
    description:
      'Returns 6 sections with 3 latest articles each for the main article page',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns structured sections data for main article page',
  })
  getArticleSections() {
    return this.newsService.getArticleSections();
  }

  @Get('client/featured')
  @ApiOperation({ summary: 'Get featured news articles' })
  @ApiResponse({ status: 200, description: 'Returns featured news articles' })
  getFeaturedNews(
    @Query('limit') limit: string = '5',
    @Query('type') type?: string,
  ) {
    return this.newsService.getFeaturedNews(parseInt(limit), type);
  }

  @Get('client/related/:id')
  @ApiOperation({ summary: 'Get related news articles' })
  @ApiParam({ name: 'id', description: 'News article ID' })
  @ApiResponse({ status: 200, description: 'Returns related news articles' })
  getRelatedNews(@Param('id') id: string, @Query('limit') limit: string = '4') {
    return this.newsService.getRelatedNews(+id, parseInt(limit));
  }

  @Get('client/:id')
  @ApiOperation({ summary: 'Get news article details for client' })
  @ApiParam({ name: 'id', description: 'News article ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns news article details for public viewing',
  })
  findOneForClient(@Param('id') id: string) {
    return this.newsService.findOneForClient(+id);
  }

  @Post('client/increment-view/:id')
  @ApiOperation({ summary: 'Increment view count for a news article' })
  @ApiParam({ name: 'id', description: 'News article ID' })
  @HttpCode(200)
  incrementViewCount(@Param('id') id: string) {
    return this.newsService.incrementViewCount(+id);
  }

  // Other admin endpoints
  @Post()
  create(@Body() createNewsDto: CreateNewsDto) {
    return this.newsService.create(createNewsDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.newsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateNewsDto: UpdateNewsDto) {
    return this.newsService.update(+id, updateNewsDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.newsService.remove(+id);
  }
}
