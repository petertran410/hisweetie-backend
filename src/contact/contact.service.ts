import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { firstValueFrom } from 'rxjs';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.webhookUrl = this.configService.get<string>('N8N_WEBHOOK_URL', '');
    this.webhookSecret = this.configService.get<string>(
      'N8N_WEBHOOK_SECRET',
      '',
    );
  }

  async submit(dto: CreateContactDto, siteCode: string = 'lermao') {
    const record = await this.prisma.contact_inquiry.create({
      data: {
        full_name: dto.receiverFullName,
        email: dto.email,
        phone: dto.phoneNumber,
        note: dto.note,
        site_code: siteCode,
        webhook_sent: false,
      },
    });

    const sent = await this.sendWebhook({
      id: Number(record.id),
      fullName: dto.receiverFullName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      note: dto.note,
      siteCode: siteCode,
      createdAt: record.created_date.toISOString(),
    });

    if (sent) {
      await this.prisma.contact_inquiry.update({
        where: { id: record.id },
        data: { webhook_sent: true },
      });
    }

    return { success: true, message: 'Gửi thông tin thành công' };
  }

  private async sendWebhook(payload: {
    id: number;
    fullName: string;
    email: string;
    phoneNumber: string;
    note: string;
    siteCode: string;
    createdAt: string;
  }): Promise<boolean> {
    try {
      const token = jwt.sign(
        { sub: 'hisweetie-backend', iat: Math.floor(Date.now() / 1000) },
        this.webhookSecret,
        { algorithm: 'HS256', expiresIn: '60s' },
      );

      await firstValueFrom(
        this.httpService.post(this.webhookUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }),
      );

      this.logger.log(`Webhook sent for contact #${payload.id}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Webhook failed for contact #${payload.id}: ${error.message}`,
      );
      return false;
    }
  }
}
