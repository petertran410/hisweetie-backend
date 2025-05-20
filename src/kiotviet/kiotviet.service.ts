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
              Retailer: this.configService.get('KIOTVIET_RETAILER'),
            },
          },
        ),
      );

      this.logger.debug(
        `Inventory response for product ${productId}: ${JSON.stringify(response.data)}`,
      );

      // Extract inventory quantity - adjust based on actual API response
      // The inventory structure might be different than expected
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

  async getProductsByCategory(
    categoryId: string,
    pageSize = 100,
    pageIndex = 0,
  ): Promise<any> {
    const token = await this.getAccessToken();

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `https://public.kiotapi.com/categories/${categoryId}/products?pageSize=${pageSize}&pageIndex=${pageIndex}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Retailer: this.configService.get('KIOTVIET_RETAILER'),
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch products for category ${categoryId}`,
        error,
      );
      throw error;
    }
  }

  // Add to KiotVietService
  async syncCategories(): Promise<Map<string, number>> {
    const token = await this.getAccessToken();
    const categoryMap = new Map<string, number>();

    try {
      const response = await firstValueFrom(
        this.httpService.get('https://public.kiotapi.com/categories', {
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.configService.get('KIOTVIET_RETAILER'),
          },
        }),
      );

      for (const kiotVietCategory of response.data.data) {
        // Find matching category in our database
        let category = await this.prisma.category.findFirst({
          where: { kiotviet_id: kiotVietCategory.categoryId.toString() },
        });

        if (!category) {
          category = await this.prisma.category.findFirst({
            where: {
              name: {
                contains: kiotVietCategory.categoryName,
              },
            },
          });

          if (category) {
            // Update the category with KiotViet ID
            await this.prisma.category.update({
              where: { id: category.id },
              data: { kiotviet_id: kiotVietCategory.categoryId.toString() },
            });
          } else {
            // Create new category
            category = await this.prisma.category.create({
              data: {
                name: kiotVietCategory.categoryName,
                kiotviet_id: kiotVietCategory.categoryId.toString(),
                created_date: new Date(),
              },
            });
          }
        }

        categoryMap.set(
          kiotVietCategory.categoryId.toString(),
          Number(category.id),
        );
      }

      return categoryMap;
    } catch (error) {
      this.logger.error('Failed to sync categories', error);
      throw error;
    }
  }
}
