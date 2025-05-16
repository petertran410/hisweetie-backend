import { Injectable } from '@nestjs/common';
import { CreateJobpostDto } from './dto/create-jobpost.dto';
import { UpdateJobpostDto } from './dto/update-jobpost.dto';

@Injectable()
export class JobpostService {
  create(createJobpostDto: CreateJobpostDto) {
    return 'This action adds a new jobpost';
  }

  findAll() {
    return `This action returns all jobpost`;
  }

  findOne(id: number) {
    return `This action returns a #${id} jobpost`;
  }

  update(id: number, updateJobpostDto: UpdateJobpostDto) {
    return `This action updates a #${id} jobpost`;
  }

  remove(id: number) {
    return `This action removes a #${id} jobpost`;
  }
}
