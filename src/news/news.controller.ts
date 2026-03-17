// src/news/news.controller.ts
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
import { CurrentSiteCode } from '../common/decorators/site-code.decorator';

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
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.newsService.findAll(
      {
        pageSize: parseInt(pageSize),
        pageNumber: parseInt(pageNumber),
        title,
        type,
      },
      siteCode,
    );
  }

  @Get('client/get-all')
  @ApiOperation({ summary: 'Get paginated news for client' })
  @UsePipes(new ValidationPipe({ transform: true }))
  findAllForClient(
    @Query() searchDto: ClientNewsSearchDto,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.newsService.findAllForClient(searchDto, siteCode);
  }

  @Get('client/find-id-by-slug')
  @ApiOperation({ summary: 'Find news ID by slug and type' })
  findIdBySlug(
    @Query('slug') slug: string,
    @Query('type') type: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.newsService.findIdBySlug(slug, type, siteCode);
  }

  @Get('client/article-sections')
  @ApiOperation({ summary: 'Get article sections for main page' })
  getArticleSections(@CurrentSiteCode() siteCode?: string) {
    return this.newsService.getArticleSections(siteCode);
  }

  @Get('client/featured')
  @ApiOperation({ summary: 'Get featured news articles' })
  getFeaturedNews(
    @Query('limit') limit: string = '5',
    @Query('type') type?: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.newsService.getFeaturedNews(parseInt(limit), type, siteCode);
  }

  @Get('client/related/:id')
  @ApiOperation({ summary: 'Get related news' })
  getRelatedNews(
    @Param('id') id: string,
    @Query('limit') limit: string = '4',
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.newsService.getRelatedNews(+id, parseInt(limit), siteCode);
  }

  @Post('client/increment-view/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Increment article view count' })
  incrementView(@Param('id') id: string) {
    return this.newsService.incrementViewCount(+id);
  }

  @Get('client/:id')
  @ApiOperation({ summary: 'Get news detail for client' })
  findOneForClient(@Param('id') id: string) {
    return this.newsService.findOne(+id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get news detail' })
  findOne(@Param('id') id: string) {
    return this.newsService.findOne(+id);
  }

  @Post()
  @ApiOperation({ summary: 'Create news' })
  @UsePipes(new ValidationPipe({ transform: true }))
  create(
    @Body() createNewsDto: CreateNewsDto,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.newsService.create(createNewsDto, siteCode);
  }

  @Patch('toggle-visibility/:id')
  @ApiOperation({ summary: 'Toggle news visibility' })
  toggleVisibility(
    @Param('id') id: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.newsService.toggleVisibility(+id, siteCode);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update news' })
  @UsePipes(new ValidationPipe({ transform: true }))
  update(
    @Param('id') id: string,
    @Body() updateNewsDto: UpdateNewsDto,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.newsService.update(+id, updateNewsDto, siteCode);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete news' })
  remove(@Param('id') id: string, @CurrentSiteCode() siteCode?: string) {
    return this.newsService.remove(+id, siteCode);
  }
}
