import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsArray,
  IsObject,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum EmploymentType {
  PART_TIME = 'PART_TIME',
  FULL_TIME = 'FULL_TIME',
  INTERNSHIP = 'INTERNSHIP',
  FREELANCE = 'FREELANCE',
}

export enum WorkMode {
  ONSITE = 'ONSITE',
  REMOTE = 'REMOTE',
  HYBRID = 'HYBRID',
}

export class WorkingHours {
  @ApiProperty({ example: '08:00' })
  @IsString()
  start: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  end: string;
}

export class SalaryRanges {
  @ApiProperty({ example: 5000000 })
  @IsNumber()
  min: number;

  @ApiProperty({ example: 10000000 })
  @IsNumber()
  max: number;
}

export class CreateJobpostDto {
  @ApiProperty({ description: 'Job title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Employment type', enum: EmploymentType })
  @IsEnum(EmploymentType)
  employmentType: EmploymentType;

  @ApiProperty({ description: 'Work mode', enum: WorkMode })
  @IsEnum(WorkMode)
  workMode: WorkMode;

  @ApiProperty({ description: 'Job description (HTML content)' })
  @IsString()
  jobDescription: string;

  @ApiProperty({ description: 'Location (address) of the job' })
  @IsString()
  location: string;

  @ApiProperty({ description: 'Application deadline', example: '2025-12-31' })
  @IsDateString()
  applicationDeadline: string;

  @ApiProperty({ description: 'Number of vacancies' })
  @IsNumber()
  vacancies: number;

  @ApiProperty({
    description: 'Working hours',
    type: [WorkingHours],
    required: false,
  })
  @IsArray()
  @IsOptional()
  @Type(() => WorkingHours)
  workingHours?: WorkingHours[];

  @ApiProperty({
    description: 'Salary range',
    type: SalaryRanges,
    required: false,
  })
  @IsObject()
  @IsOptional()
  @Type(() => SalaryRanges)
  salaryRanges?: SalaryRanges;
}
