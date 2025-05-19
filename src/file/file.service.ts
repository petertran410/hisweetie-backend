import { Injectable } from '@nestjs/common';

@Injectable()
export class FileService {
  async saveFile(file: Express.Multer.File): Promise<string> {
    return `/img/${file.filename}`;
  }
}
