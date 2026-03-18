import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReviewService } from './review.service';
import { CurrentSiteCode } from '../common/decorators/site-code.decorator';

@ApiTags('review')
@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('testimonials')
  @ApiOperation({ summary: 'Get all testimonials for CMS' })
  getAll(
    @Query('pageSize') pageSize: string = '10',
    @Query('pageNumber') pageNumber: string = '0',
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.reviewService.getAllTestimonials({
      pageSize: +pageSize,
      pageNumber: +pageNumber,
      siteCode,
    });
  }

  @Get('testimonials/:id')
  @ApiOperation({ summary: 'Get testimonial by ID' })
  getOne(@Param('id') id: string, @CurrentSiteCode() siteCode: string) {
    return this.reviewService.getTestimonialById(+id, siteCode);
  }

  @Post('testimonials')
  @ApiOperation({ summary: 'Create testimonial' })
  create(@Body() body: any, @CurrentSiteCode() siteCode: string) {
    return this.reviewService.createTestimonial(body, siteCode);
  }

  @Patch('testimonials/:id')
  @ApiOperation({ summary: 'Update testimonial' })
  update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentSiteCode() siteCode: string,
  ) {
    return this.reviewService.updateTestimonial(+id, body, siteCode);
  }

  @Delete('testimonials/:id')
  @ApiOperation({ summary: 'Delete testimonial' })
  remove(@Param('id') id: string, @CurrentSiteCode() siteCode: string) {
    return this.reviewService.deleteTestimonial(+id, siteCode);
  }

  @Get('client/testimonials')
  @ApiOperation({ summary: 'Get testimonials for client website' })
  getClientTestimonials(@CurrentSiteCode() siteCode: string) {
    return this.reviewService.getClientTestimonials(siteCode);
  }
}
