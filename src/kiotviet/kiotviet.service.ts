import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class KiotvietService {
  private readonly logger = new Logger(KiotvietService.name);
  private accessToken: string;
  private tokenExpiry: Date;
  private prisma = new PrismaClient();

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
                `${this.configService.get('KIOT_CLIENT_ID')}:${this.configService.get('KIOT_SECRET_KEY')}`,
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

  async getCategories(): Promise<any> {
    const token = await this.getAccessToken();

    try {
      this.logger.log('Requesting categories from KiotViet API');
      const response = await firstValueFrom(
        this.httpService.get('https://public.kiotapi.com/categories', {
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.configService.get('KIOT_SHOP_NAME'),
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch categories from KiotViet', error);
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
      this.logger.log(`Requesting products with params: ${params}`);
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

  async getProductsByCategory(
    categoryId: string,
    pageSize = 100,
    pageIndex = 0,
  ): Promise<any> {
    const token = await this.getAccessToken();

    try {
      this.logger.log(
        `Requesting products for category ${categoryId}, page ${pageIndex}, size ${pageSize}`,
      );
      const response = await firstValueFrom(
        this.httpService.get(
          `https://public.kiotapi.com/categories/${categoryId}/products?pageSize=${pageSize}&pageIndex=${pageIndex}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Retailer: this.configService.get('KIOT_SHOP_NAME'),
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch products for category ${categoryId}: ${error.message}`,
      );
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

      // Extract inventory quantity
      let onHand = 0;
      if (response.data && Array.isArray(response.data)) {
        onHand = response.data[0]?.onHand || 0;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        onHand = response.data.data[0]?.onHand || 0;
      }

      return onHand;
    } catch (error) {
      this.logger.error(
        `Failed to fetch inventory for product ${productId}`,
        error,
      );
      // Return 0 instead of throwing to allow the process to continue
      return 0;
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
}
