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
  Put,
  NotFoundException,
} from '@nestjs/common';
import { JobpostService } from './jobpost.service';
import { CreateJobpostDto } from './dto/create-jobpost.dto';
import { UpdateJobpostDto } from './dto/update-jobpost.dto';
import { JobSearchDto } from './dto/job-search.dto';
import { ApplicationSearchDto } from './dto/application-search.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('job')
@Controller('job')
export class JobpostController {
  constructor(private readonly jobpostService: JobpostService) {}

  @Get('client/search')
  @ApiOperation({
    summary: 'Search for job postings with pagination and filtering',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns paginated job listings with filter options for title and application deadline',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  search(@Query() searchDto: JobSearchDto) {
    return this.jobpostService.search(searchDto);
  }

  @Get('admin/apply/search')
  @ApiOperation({ summary: 'Search for job applications' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated job applications',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  searchApplications(@Query() searchDto: ApplicationSearchDto) {
    return this.jobpostService.searchApplications(searchDto);
  }

  @Post('admin')
  @ApiOperation({ summary: 'Create a new job posting' })
  @ApiResponse({
    status: 201,
    description: 'The job posting has been successfully created.',
  })
  @UsePipes(new ValidationPipe())
  create(@Body() createJobpostDto: CreateJobpostDto) {
    return this.jobpostService.create(createJobpostDto);
  }

  @Get('client/:id')
  @ApiOperation({ summary: 'Get a job posting by ID' })
  @ApiParam({ name: 'id', description: 'Job posting ID' })
  @ApiResponse({ status: 200, description: 'Returns the job posting details.' })
  @ApiResponse({ status: 404, description: 'Job posting not found.' })
  findOne(@Param('id') id: string) {
    return this.jobpostService.findOne(+id);
  }

  @Put('admin/:id')
  @ApiOperation({ summary: 'Update a job posting' })
  @ApiParam({ name: 'id', description: 'Job posting ID' })
  @ApiResponse({
    status: 200,
    description: 'The job posting has been successfully updated.',
  })
  @ApiResponse({ status: 404, description: 'Job posting not found.' })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  update(@Param('id') id: string, @Body() updateJobpostDto: UpdateJobpostDto) {
    return this.jobpostService.update(+id, updateJobpostDto);
  }

  @Post('admin/change-status/:id')
  @ApiOperation({ summary: 'Change the status of a job application' })
  @ApiParam({ name: 'id', description: 'Applicant ID' })
  @ApiResponse({
    status: 200,
    description: 'The application status has been successfully updated.',
  })
  @ApiResponse({ status: 404, description: 'Application not found.' })
  @UsePipes(new ValidationPipe())
  changeStatus(
    @Param('id') id: string,
    @Body() changeStatusDto: ChangeStatusDto,
  ) {
    return this.jobpostService.changeStatus(+id, changeStatusDto);
  }

  @Delete('recruitment/:id')
  @ApiOperation({ summary: 'Delete a job posting' })
  @ApiParam({ name: 'id', description: 'Job posting ID' })
  @ApiResponse({
    status: 200,
    description: 'The job posting has been successfully deleted.',
  })
  @ApiResponse({ status: 404, description: 'Job posting not found.' })
  remove(@Param('id') id: string) {
    return this.jobpostService.remove(+id);
  }
}
