import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  postCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.postCategory(createCategoryDto);
  }

  @Get('v2/get-all')
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(+id, updateCategoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoryService.remove(+id);
  }
}
