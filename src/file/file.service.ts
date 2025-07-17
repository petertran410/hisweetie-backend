import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FileService {
  constructor(private readonly configService: ConfigService) {}

  async saveFile(file: Express.Multer.File): Promise<string> {
    const baseUrl = this.getBaseUrl();

    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    return `${cleanBaseUrl}/public/img/${file.filename}`;
  }

  private getBaseUrl(): string {
    const explicitBaseUrl = this.configService.get<string>('BASE_URL');
    if (explicitBaseUrl) {
      return explicitBaseUrl;
    }

    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const port = this.configService.get<string>('PORT') || '8084';

    if (nodeEnv === 'production') {
      return 'https://api.gaulermao.com';
    } else {
      return `http://localhost:${port}`;
    }
  }
}
