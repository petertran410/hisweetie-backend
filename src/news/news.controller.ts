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
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  // Admin endpoints
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

  // Client endpoints
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
