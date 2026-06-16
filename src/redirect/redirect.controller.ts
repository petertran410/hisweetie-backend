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
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RedirectService } from './redirect.service';
import { CreateRedirectDto } from './dto/create-redirect.dto';
import { UpdateRedirectDto } from './dto/update-redirect.dto';
import { CurrentSiteCode } from '../common/decorators/site-code.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('redirect')
@Controller('redirect')
export class RedirectController {
  constructor(private readonly redirectService: RedirectService) {}

  // Public: middleware client lấy danh sách redirect đang bật. KHÔNG guard.
  // Đặt trước ':id' để route 'client/map' không bị param ':id' nuốt.
  @Get('client/map')
  @ApiOperation({ summary: 'Lấy danh sách redirect đang bật cho client' })
  getActiveMap(@CurrentSiteCode() siteCode: string) {
    return this.redirectService.getActiveMap(siteCode);
  }

  @Get('paginated')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Danh sách redirect (CMS, phân trang)' })
  getAllPaginated(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @Query('keyword') keyword?: string,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.redirectService.getAll(
      {
        pageSize: parseInt(pageSize),
        pageNumber: parseInt(pageNumber),
        keyword,
      },
      siteCode,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Chi tiết redirect' })
  findOne(@Param('id') id: string, @CurrentSiteCode() siteCode: string) {
    const numId = +id;
    if (isNaN(numId)) {
      throw new BadRequestException(`ID redirect không hợp lệ: "${id}"`);
    }
    return this.redirectService.findOne(numId, siteCode);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: 'Tạo redirect' })
  create(
    @Body() createRedirectDto: CreateRedirectDto,
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.redirectService.create(createRedirectDto, siteCode);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: 'Cập nhật redirect' })
  update(
    @Param('id') id: string,
    @Body() updateRedirectDto: UpdateRedirectDto,
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.redirectService.update(+id, updateRedirectDto, siteCode);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Xóa redirect' })
  remove(@Param('id') id: string, @CurrentSiteCode() siteCode: string) {
    return this.redirectService.remove(+id, siteCode);
  }
}
