import { Injectable, HttpServer } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { URLSearchParams } from 'url';

@Injectable()
export class KiotvietService {
  constructor(
    private httpServer: HttpServer,
    private configService: ConfigService,
  ) {}

  private token: string;
  private tokenExpiry: Date;
  private apiUrl = process.env.KIOT_BASE_URL;

  prisma = new PrismaClient();

  private async authenticate() {
    try {
      if (this.token && this.tokenExpiry > new Date()) {
        return this.token;
      }
      const apiGetToken = this.configService.get<string>('KIOT_TOKEN');
      const clientId = this.configService.get<string>('KIOT_CLIEND_ID');
      const clientSecret = this.configService.get<string>('KIOT_SECRET_KEY');

      if (!apiGetToken || !clientId || !clientSecret) {
        throw new Error('Missing KiotViet API configuration');
      }

      const response = await axios.post(
        apiGetToken,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
          scopes: 'PublicApi.Access',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      this.token = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);

      return this.token;
    } catch (error) {
      console.error('Lỗi khi lấy KiotViet token:', error.message);
      throw error;
    }
  }

  async getProducts(page = 1, pageSize = 100) {
    const token = await this.authenticate();

    const response = await axios.get(`${this.apiUrl}/products`, {
      params: {
        pageSize,
        currentPage: page,
        includeInventory: true,
        includePricebook: true,
        includeQuantity: true,
        includeSerials: true,
        IncludeBatchExpires: true,
        includeWarranties: true,
        orderBy: 'name',
      },
      headers: {
        Authorization: `Bearer ${token}`,
        Retailer: this.configService.get('KIOT_SHOP_NAME'),
      },
    });

    return response.data;
  }

  async syncProducts() {
    let page = 1;
    let hasMorePages = true;
    const pageSize = 100;
    let totalSynced = 0;

    while (hasMorePages) {
      const productData = await this.getProducts(page, pageSize);
      const products = productData.data;

      for (const kiotProduct of products) {
        const productData = {
          title: kiotProduct.name,
          price: kiotProduct.basePrice,
          quantity: kiotProduct.onHand,
          description: kiotProduct.description || '',
          general_description: kiotProduct.shortDescription || '',
          images_url: JSON.stringify(
            kiotProduct.images?.map((img) => img.url) || [],
          ),
          type: 'SAN_PHAM',
          instruction: kiotProduct.usageInstructions || '',
        };

        const existingProduct = await this.prisma.product.findFirst({
          where: {
            kiotviet_id: kiotProduct.id.toString(),
          },
        });
        if (existingProduct) {
          await this.prisma.product.update({
            where: {
              id: existingProduct.id,
            },
            data: productData,
          });
        } else {
          await this.prisma.product.create({
            data: {
              ...productData,
              kiotviet_id: kiotProduct.id.toString(),
            },
          });
        }

        totalSynced++;
      }

      hasMorePages = products.length === pageSize;
      page++;
    }

    return { totalSynced };
  }
}
