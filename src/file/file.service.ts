import { Injectable } from '@nestjs/common';

@Injectable()
export class FileService {
  async saveFile(file: Express.Multer.File): Promise<string> {
    return `http://localhost:8084/public/img/${file.filename}`;
  }
}
