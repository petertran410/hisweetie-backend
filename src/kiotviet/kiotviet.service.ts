import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class KiotvietService {
  private readonly logger = new Logger(KiotvietService.name);
  private accessToken: string;
  private tokenExpiry: Date;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getAccessToken(): Promise<string> {
    // Check if token is still valid
    if (this.accessToken && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://id.kiotviet.vn/connect/token',
          'grant_type=client_credentials&scopes=PublicApi.Access',
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${Buffer.from(
                `${this.configService.get('KIOT_CLIEND_ID')}:${this.configService.get('KIOT_SECRET_KEY')}`,
              ).toString('base64')}`,
            },
          },
        ),
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);
      return this.accessToken;
    } catch (error) {
      this.logger.error('Failed to get KiotViet access token', error);
      throw error;
    }
  }

  async getProducts(
    pageSize = 100,
    pageIndex = 0,
    lastModifiedDate?: string,
  ): Promise<any> {
    const token = await this.getAccessToken();

    let params = `pageSize=${pageSize}&pageIndex=${pageIndex}`;
    if (lastModifiedDate) {
      params += `&lastModifiedDate=${lastModifiedDate}`;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`https://public.kiotapi.com/products?${params}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.configService.get('KIOT_SHOP_NAME'),
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch products from KiotViet: ${error.message}`,
      );
      throw error;
    }
  }

  async createOrder(orderData: any): Promise<any> {
    const token = await this.getAccessToken();

    try {
      const response = await firstValueFrom(
        this.httpService.post('https://public.kiotapi.com/orders', orderData, {
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.configService.get('KIOT_SHOP_NAME'),
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create order in KiotViet: ${error.message}`);
      throw error;
    }
  }

  async getProductInventory(productId: string): Promise<number> {
    const token = await this.getAccessToken();

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `https://public.kiotapi.com/products/${productId}/inventories`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Retailer: this.configService.get('KIOT_SHOP_NAME'),
            },
          },
        ),
      );

      const onHand = response.data?.[0]?.onHand || 0;
      return onHand;
    } catch (error) {
      this.logger.error(
        `Failed to fetch inventory for product ${productId}`,
        error,
      );
      return 0;
    }
  }
}
