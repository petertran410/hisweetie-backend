import { PartialType } from '@nestjs/swagger';
import { CreateJobpostDto } from './create-jobpost.dto';

export class UpdateJobpostDto extends PartialType(CreateJobpostDto) {}
