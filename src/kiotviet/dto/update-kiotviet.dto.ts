import { PartialType } from '@nestjs/swagger';
import { CreateKiotvietDto } from './create-kiotviet.dto';

export class UpdateKiotvietDto extends PartialType(CreateKiotvietDto) {}
