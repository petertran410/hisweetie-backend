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
        this.httpService.get(`${this.baseUrl}/bankaccounts/count`, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        }),
      );

      this.logger.log('SePay test response:', response.data);

      if (response.data.status === 200 && response.data.messages?.success) {
        return {
          success: true,
          message: `SePay connection successful. Found ${response.data.count_bankaccounts} bank accounts.`,
        };
      } else {
        return {
          success: false,
          message: 'SePay API returned error response',
        };
      }
    } catch (error) {
      this.logger.error(
        'SePay connection failed:',
        error.response?.data || error.message,
      );
      return {
        success: false,
        message: `SePay connection failed: ${error.response?.data?.error || error.message}`,
      };
    }
  }

  generateQRCode(orderId: string, amount: number): string {
    const content = `SEVQR Thanh Toan Don Hang co ID ${orderId}`;
    return `https://qr.sepay.vn/img?bank=${this.bankName}&acc=${this.bankAccount}&template=compact&amount=${amount}&des=${encodeURIComponent(content)}`;
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

      if (response.data.status !== 200) {
        throw new Error(`SePay API error: ${response.data.error}`);
      }

      const transactions = response.data?.transactions || [];
      const orderContent = `SEVQR Thanh Toan Don Hang co ID ${orderId}`;

      const matchingTransaction = transactions.find(
        (tx: any) =>
          tx.transaction_content?.includes(orderContent) &&
          Math.abs(parseFloat(tx.amount_in) - amount) < 1000 &&
          parseFloat(tx.amount_in) > 0,
      );

      return matchingTransaction || null;
    } catch (error) {
      this.logger.error(
        'Failed to check transactions:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async validateApiToken(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/bankaccounts/count`, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        }),
      );

      return response.data.status === 200;
    } catch (error) {
      this.logger.error(
        'API token validation failed:',
        error.response?.data || error.message,
      );
      return false;
    }
  }
}
