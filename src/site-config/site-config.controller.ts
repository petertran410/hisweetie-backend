import {
  Controller,
  Get,
  Put,
  Body,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SiteConfigService } from './site-config.service';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { CurrentSiteCode } from '../common/decorators/site-code.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('site-config')
@Controller('site-config')
export class SiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  // Public: header client lấy danh mục menu (configured=false -> client fallback).
  // Đặt trước các route khác để tránh xung đột.
  @Get('client/menu-category')
  @ApiOperation({ summary: 'Lấy danh mục menu cho header client' })
  getClientMenuCategory(@CurrentSiteCode() siteCode: string) {
    return this.siteConfigService.getClientMenuCategory(siteCode);
  }

  // CMS: danh sách danh mục cha để chọn (chỉ name + slug).
  @Get('parent-categories')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Danh mục cha để chọn làm menu (CMS)' })
  getParentCategories(@CurrentSiteCode() siteCode: string) {
    return this.siteConfigService.getParentCategories(siteCode);
  }

  // CMS: cấu hình menu hiện tại (slug đang chọn).
  @Get('menu-category')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy cấu hình danh mục menu hiện tại (CMS)' })
  getMenuCategoryConfig(@CurrentSiteCode() siteCode: string) {
    return this.siteConfigService.getMenuCategoryConfig(siteCode);
  }

  // CMS: lưu slug danh mục cha cho menu.
  @Put('menu-category')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: 'Cập nhật danh mục menu (CMS)' })
  updateMenuCategory(
    @Body() dto: UpdateMenuCategoryDto,
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.siteConfigService.updateMenuCategory(dto, siteCode);
  }
}
