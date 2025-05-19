import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { URLSearchParams } from 'url';

@Injectable()
export class KiotvietService {
  constructor(private configService: ConfigService) {}

  private token: string;
  private tokenExpiry: Date;
  private apiUrl = process.env.KIOT_BASE_URL || 'https://public.kiotapi.com';

  prisma = new PrismaClient();

  private async authenticate() {
    try {
      if (this.token && this.tokenExpiry > new Date()) {
        return this.token;
      }

      const clientId = this.configService.get<string>('KIOT_CLIEND_ID');
      const clientSecret = this.configService.get<string>('KIOT_SECRET_KEY');
      const shopName = this.configService.get<string>('KIOT_SHOP_NAME');

      if (!clientId || !clientSecret || !shopName) {
        throw new Error('Missing KiotViet API configuration');
      }

      const response = await axios.post(
        'https://id.kiotviet.vn/connect/token',
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
      console.error('Error fetching KiotViet token:', error.message);
      throw error;
    }
  }

  async getProducts(page = 1, pageSize = 100) {
    const token = await this.authenticate();
    const shopName = this.configService.get<string>('KIOT_SHOP_NAME');

    const response = await axios.get(`${this.apiUrl}/products`, {
      params: {
        pageSize,
        currentPage: page,
        includeInventory: true,
        includePricebook: true,
        includeQuantity: true,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        Retailer: shopName,
      },
    });

    return response.data;
  }

  async syncProducts() {
    let page = 1;
    let hasMorePages = true;
    const pageSize = 100;
    let totalSynced = 0;

    try {
      while (hasMorePages) {
        const productData = await this.getProducts(page, pageSize);
        const products = productData.data;

        for (const kiotProduct of products) {
          // Skip products without necessary data
          if (!kiotProduct.name || !kiotProduct.basePrice) {
            continue;
          }

          const productData = {
            title: kiotProduct.name,
            price: kiotProduct.basePrice,
            quantity: kiotProduct.onHand || 0,
            description: kiotProduct.description || '',
            general_description: kiotProduct.shortDescription || '',
            images_url: JSON.stringify(
              kiotProduct.images?.map((img) => img.url) || [],
            ),
            type: 'SAN_PHAM',
            is_featured: false,
          };

          // Find existing product or create new one
          try {
            const existingProduct = await this.prisma.product.findFirst({
              where: {
                kiotviet_id: BigInt(kiotProduct.id),
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
                  kiotviet_id: BigInt(kiotProduct.id),
                  created_date: new Date(),
                },
              });
            }

            totalSynced++;
          } catch (error) {
            console.error(`Error syncing product ${kiotProduct.id}:`, error);
          }
        }

        hasMorePages = products.length === pageSize;
        page++;
      }

      return { totalSynced };
    } catch (error) {
      console.error('Error during product sync:', error);
      throw error;
    }
  }

  async getProductsFromDb(page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;

    const where = { kiotviet_id: { not: null } };

    const totalElements = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { id: 'desc' },
      include: {
        product_categories: {
          include: {
            category: true,
          },
        },
      },
    });

    const content = products.map((product) => {
      let imagesUrl = [];
      try {
        imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
      } catch (error) {
        console.log(
          `Failed to parse images_url for product ${product.id}:`,
          error,
        );
      }

      return {
        ...product,
        imagesUrl,
        isFeatured: product.is_featured,
        ofCategories: product.product_categories.map((pc) => ({
          id: pc.categories_id,
          name: pc.category?.name || '',
        })),
      };
    });

    return {
      content,
      totalElements,
      pageable: {
        pageNumber: page - 1,
        pageSize,
        pageCount: Math.ceil(totalElements / pageSize),
      },
    };
  }
}
