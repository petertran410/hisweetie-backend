import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { JobpostService } from './jobpost.service';
import { CreateJobpostDto } from './dto/create-jobpost.dto';
import { UpdateJobpostDto } from './dto/update-jobpost.dto';

@Controller('jobpost')
export class JobpostController {
  constructor(private readonly jobpostService: JobpostService) {}

  @Post()
  create(@Body() createJobpostDto: CreateJobpostDto) {
    return this.jobpostService.create(createJobpostDto);
  }

  @Get()
  findAll() {
    return this.jobpostService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobpostService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateJobpostDto: UpdateJobpostDto) {
    return this.jobpostService.update(+id, updateJobpostDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.jobpostService.remove(+id);
  }
}
