import { Injectable } from '@nestjs/common';
import { CreateInternalDto } from './dto/create-internal.dto';
import { UpdateInternalDto } from './dto/update-internal.dto';

@Injectable()
export class InternalService {
  create(createInternalDto: CreateInternalDto) {
    return 'This action adds a new internal';
  }

  findAll() {
    return `This action returns all internal`;
  }

  findOne(id: number) {
    return `This action returns a #${id} internal`;
  }

  update(id: number, updateInternalDto: UpdateInternalDto) {
    return `This action updates a #${id} internal`;
  }

  remove(id: number) {
    return `This action removes a #${id} internal`;
  }
}
