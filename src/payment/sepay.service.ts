import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);
  private readonly baseUrl: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly bankAccount: string | undefined;
  private readonly bankName: string | undefined;
  private readonly accountHolder: string | undefined;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get('SEPAY_BASE_URL');
    this.apiToken = this.configService.get('SEPAY_API_TOKEN');
    this.bankAccount = this.configService.get('SEPAY_BANK_ACCOUNT');
    this.bankName = this.configService.get('SEPAY_BANK_NAME');
    this.accountHolder = this.configService.get('SEPAY_ACCOUNT_HOLDER');
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/banks`, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        }),
      );

      return {
        success: true,
        message: 'SePay connection successful',
      };
    } catch (error) {
      this.logger.error('SePay connection failed:', error.message);
      return {
        success: false,
        message: `SePay connection failed: ${error.message}`,
      };
    }
  }

  generateQRCode(orderId: string, amount: number): string {
    const content = `DH${orderId}`;
    return `https://qr.sepay.vn/img?bank=${this.bankName}&acc=${this.bankAccount}&template=compact&amount=${amount}&des=${content}`;
  }

  async checkTransactions(orderId: string, amount: number): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/transactions`, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
          params: {
            account_number: this.bankAccount,
            limit: 50,
          },
        }),
      );

      const transactions = response.data?.transactions || [];
      const orderContent = `DH${orderId}`;

      const matchingTransaction = transactions.find(
        (tx: any) =>
          tx.content?.includes(orderContent) &&
          Math.abs(tx.amount - amount) < 1000 &&
          tx.type === 'in',
      );

      return matchingTransaction || null;
    } catch (error) {
      this.logger.error('Failed to check transactions:', error.message);
      throw error;
    }
  }
}
