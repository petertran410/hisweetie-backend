import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateJobpostDto } from './dto/create-jobpost.dto';
import { UpdateJobpostDto } from './dto/update-jobpost.dto';
import { JobSearchDto, JobStatus } from './dto/job-search.dto';
import { ApplicationSearchDto } from './dto/application-search.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class JobpostService {
  prisma = new PrismaClient();

  async search(searchDto: JobSearchDto) {
    const {
      pageSize = 10,
      pageNumber = 0,
      title,
      applicationDeadline,
      status,
    } = searchDto;

    // Build where conditions for Prisma query
    const where: any = {};

    if (title) {
      where.title = { contains: title };
    }

    // Handle deadline filtering
    if (applicationDeadline) {
      where.application_deadline = {
        gte: new Date(applicationDeadline),
      };
    } else if (status === JobStatus.NOT_EXPIRED) {
      // If NOT_EXPIRED status is selected, show only jobs with deadlines in the future
      where.application_deadline = {
        gte: new Date(),
      };
    }

    // Get total count for pagination
    const totalElements = await this.prisma.job_post.count({ where });

    // Get filtered and paginated jobs
    const jobs = await this.prisma.job_post.findMany({
      where,
      skip: pageNumber * pageSize,
      take: pageSize,
      orderBy: { created_date: 'desc' },
    });

    // Transform database model to API response format
    const content = jobs.map((job) => {
      // Parse working_hours JSON
      let workingHours = [];
      try {
        workingHours = job.working_hours ? JSON.parse(job.working_hours) : [];
      } catch (error) {
        console.error(
          `Failed to parse working_hours for job ${job.id}:`,
          error,
        );
      }

      // Parse salary_ranges JSON
      let salaryRanges = null;
      try {
        salaryRanges = job.salary_ranges ? JSON.parse(job.salary_ranges) : null;
      } catch (error) {
        console.error(
          `Failed to parse salary_ranges for job ${job.id}:`,
          error,
        );
      }

      return {
        id: job.id.toString(),
        title: job.title,
        employmentType: job.employment_type,
        workMode: job.work_mode,
        jobDescription: job.job_description,
        location: job.location,
        // Fix for the date format - ensure it's an ISO string
        applicationDeadline: job.application_deadline
          ? job.application_deadline.toISOString()
          : null,
        vacancies: job.vacancies,
        workingHours: workingHours,
        salaryRanges: salaryRanges,
        createdDate: job.created_date,
        updatedDate: job.updated_date,
      };
    });

    // Return paginated response
    return {
      content,
      totalElements,
      pageable: {
        pageNumber,
        pageSize,
      },
    };
  }

  async searchApplications(searchDto: ApplicationSearchDto) {
    const { pageSize = 10, pageNumber = 0, title } = searchDto;

    // Find job by title first (if title is provided)
    let jobId: BigInt | undefined;
    if (title) {
      const job = await this.prisma.job_post.findFirst({
        where: { title: { contains: title } },
        select: { id: true },
      });
      if (job) {
        jobId = job.id;
      } else {
        // If no job found with the title, return empty results
        return {
          content: [],
          totalElements: 0,
          pageable: {
            pageNumber,
            pageSize,
          },
        };
      }
    }

    // Build where conditions
    const where: any = {};
    if (jobId) {
      where.job_post_id = jobId;
    }

    // Get total count for pagination
    const totalElements = await this.prisma.application.count({ where });

    // Get applications with related data
    const applications = await this.prisma.application.findMany({
      where,
      include: {
        applicant: true,
        job_post: true,
      },
      skip: pageNumber * pageSize,
      take: pageSize,
      orderBy: { created_date: 'desc' },
    });

    // Transform data for frontend
    const content = applications.map((application) => ({
      id: application.id.toString(),
      status: application.status,
      note: application.note,
      createdDate: application.created_date,
      updatedDate: application.updated_date,
      applicant: application.applicant
        ? {
            id: application.applicant.id.toString(),
            name: application.applicant.name,
            email: application.applicant.email,
            phoneNumber: application.applicant.phone_number,
            resumeUrl: application.applicant.resume_url,
          }
        : null,
      jobPost: application.job_post
        ? {
            id: application.job_post.id.toString(),
            title: application.job_post.title,
          }
        : null,
    }));

    return {
      content,
      totalElements,
      pageable: {
        pageNumber,
        pageSize,
      },
    };
  }

  async create(createJobpostDto: CreateJobpostDto) {
    const {
      title,
      employmentType,
      workMode,
      jobDescription,
      location,
      applicationDeadline,
      vacancies,
      workingHours,
      salaryRanges,
    } = createJobpostDto;

    // Create job posting
    const job = await this.prisma.job_post.create({
      data: {
        title,
        employment_type: employmentType,
        work_mode: workMode,
        job_description: jobDescription,
        location,
        application_deadline: new Date(applicationDeadline),
        vacancies,
        working_hours: workingHours ? JSON.stringify(workingHours) : null,
        salary_ranges: salaryRanges ? JSON.stringify(salaryRanges) : null,
        created_date: new Date(),
      },
    });

    // Return formatted job
    return {
      id: job.id.toString(),
      title: job.title,
      employmentType: job.employment_type,
      workMode: job.work_mode,
      jobDescription: job.job_description,
      location: job.location,
      applicationDeadline: job.application_deadline,
      vacancies: job.vacancies,
      workingHours: workingHours || [],
      salaryRanges: salaryRanges || null,
      createdDate: job.created_date,
    };
  }

  async findOne(id: number) {
    const job = await this.prisma.job_post.findUnique({
      where: { id: BigInt(id) },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    // Parse working_hours JSON
    let workingHours = [];
    try {
      workingHours = job.working_hours ? JSON.parse(job.working_hours) : [];
    } catch (error) {
      console.error(`Failed to parse working_hours for job ${job.id}:`, error);
    }

    // Parse salary_ranges JSON
    let salaryRanges = null;
    try {
      salaryRanges = job.salary_ranges ? JSON.parse(job.salary_ranges) : null;
    } catch (error) {
      console.error(`Failed to parse salary_ranges for job ${job.id}:`, error);
    }

    // Return formatted job
    return {
      id: job.id.toString(),
      title: job.title,
      employmentType: job.employment_type,
      workMode: job.work_mode,
      jobDescription: job.job_description,
      location: job.location,
      applicationDeadline: job.application_deadline
        ? job.application_deadline.toISOString()
        : null,
      vacancies: job.vacancies,
      workingHours: workingHours,
      salaryRanges: salaryRanges,
      createdDate: job.created_date,
      updatedDate: job.updated_date,
    };
  }

  async update(id: number, updateJobpostDto: UpdateJobpostDto) {
    // Check if job exists
    const jobExists = await this.prisma.job_post.findUnique({
      where: { id: BigInt(id) },
    });

    if (!jobExists) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    const {
      title,
      employmentType,
      workMode,
      jobDescription,
      location,
      applicationDeadline,
      vacancies,
      workingHours,
      salaryRanges,
    } = updateJobpostDto;

    // Prepare update data
    const updateData: any = {
      updated_date: new Date(),
    };

    // Only include fields that are provided
    if (title !== undefined) updateData.title = title;
    if (employmentType !== undefined)
      updateData.employment_type = employmentType;
    if (workMode !== undefined) updateData.work_mode = workMode;
    if (jobDescription !== undefined)
      updateData.job_description = jobDescription;
    if (location !== undefined) updateData.location = location;
    if (applicationDeadline !== undefined) {
      updateData.application_deadline = new Date(applicationDeadline);
    }
    if (vacancies !== undefined) updateData.vacancies = vacancies;
    if (workingHours !== undefined) {
      updateData.working_hours = JSON.stringify(workingHours);
    }
    if (salaryRanges !== undefined) {
      updateData.salary_ranges = JSON.stringify(salaryRanges);
    }

    // Update job
    const updatedJob = await this.prisma.job_post.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    // Parse working_hours JSON for response
    let parsedWorkingHours = [];
    try {
      parsedWorkingHours = updatedJob.working_hours
        ? JSON.parse(updatedJob.working_hours)
        : [];
    } catch (error) {
      console.error(
        `Failed to parse working_hours for job ${updatedJob.id}:`,
        error,
      );
    }

    // Parse salary_ranges JSON for response
    let parsedSalaryRanges = null;
    try {
      parsedSalaryRanges = updatedJob.salary_ranges
        ? JSON.parse(updatedJob.salary_ranges)
        : null;
    } catch (error) {
      console.error(
        `Failed to parse salary_ranges for job ${updatedJob.id}:`,
        error,
      );
    }

    // Return updated job
    return {
      id: updatedJob.id.toString(),
      title: updatedJob.title,
      employmentType: updatedJob.employment_type,
      workMode: updatedJob.work_mode,
      jobDescription: updatedJob.job_description,
      location: updatedJob.location,
      applicationDeadline: updatedJob.application_deadline,
      vacancies: updatedJob.vacancies,
      workingHours: parsedWorkingHours,
      salaryRanges: parsedSalaryRanges,
      createdDate: updatedJob.created_date,
      updatedDate: updatedJob.updated_date,
    };
  }

  async changeStatus(id: number, changeStatusDto: ChangeStatusDto) {
    const { status, note } = changeStatusDto;

    // First check if the applicant exists
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: BigInt(id) },
    });

    if (!applicant) {
      throw new NotFoundException(`Applicant with ID ${id} not found`);
    }

    // Find the application by applicant ID
    const application = await this.prisma.application.findFirst({
      where: { applicant_id: BigInt(id) },
    });

    if (!application) {
      throw new NotFoundException(
        `Application for applicant with ID ${id} not found`,
      );
    }

    // Update application status
    const updatedApplication = await this.prisma.application.update({
      where: { id: application.id },
      data: {
        status,
        note: note || application.note,
        updated_date: new Date(),
      },
    });

    return {
      id: updatedApplication.id.toString(),
      status: updatedApplication.status,
      note: updatedApplication.note,
      updatedDate: updatedApplication.updated_date,
      message: 'Application status updated successfully',
    };
  }

  async remove(id: number) {
    // Check if job exists
    const jobExists = await this.prisma.job_post.findUnique({
      where: { id: BigInt(id) },
    });

    if (!jobExists) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    // Delete applications associated with this job
    await this.prisma.application.deleteMany({
      where: { job_post_id: BigInt(id) },
    });

    // Delete the job
    await this.prisma.job_post.delete({
      where: { id: BigInt(id) },
    });

    return {
      message: `Job with ID ${id} and all associated applications have been deleted`,
    };
  }
}
