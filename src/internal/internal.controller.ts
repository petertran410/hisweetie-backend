import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InternalService } from './internal.service';
import { CreateInternalDto } from './dto/create-internal.dto';
import { UpdateInternalDto } from './dto/update-internal.dto';

@Controller('internal')
export class InternalController {
  constructor(private readonly internalService: InternalService) {}

  @Post()
  create(@Body() createInternalDto: CreateInternalDto) {
    return this.internalService.create(createInternalDto);
  }

  @Get()
  findAll() {
    return this.internalService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.internalService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateInternalDto: UpdateInternalDto) {
    return this.internalService.update(+id, updateInternalDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.internalService.remove(+id);
  }
}
