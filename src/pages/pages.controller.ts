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
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentSiteCode } from '../common/decorators/site-code.decorator';

@ApiTags('pages')
@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  create(@Body() dto: CreatePagesDto, @CurrentSiteCode() siteCode: string) {
    return this.pagesService.create(dto, siteCode);
  }

  @Get()
  findAll(
    @Query() searchDto: SearchPagesDto,
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.pagesService.findAll(searchDto, siteCode);
  }

  @Get('by-slug/:slug')
  findBySlug(@Param('slug') slug: string, @CurrentSiteCode() siteCode: string) {
    return this.pagesService.findBySlug(slug, siteCode);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentSiteCode() siteCode: string) {
    return this.pagesService.findOne(+id, siteCode);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePagesDto,
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.pagesService.update(+id, dto, siteCode);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentSiteCode() siteCode: string) {
    return this.pagesService.remove(+id, siteCode);
  }
}
