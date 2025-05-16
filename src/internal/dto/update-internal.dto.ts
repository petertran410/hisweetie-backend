import { PartialType } from '@nestjs/swagger';
import { CreateInternalDto } from './create-internal.dto';

export class UpdateInternalDto extends PartialType(CreateInternalDto) {}
