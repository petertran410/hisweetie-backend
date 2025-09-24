import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class KiotVietService {
  private readonly logger = new Logger(KiotVietService.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly retailerName: string;
  private accessToken: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    const baseUrl = this.configService.get('KIOT_BASE_URL');
    if (!baseUrl) {
      throw new Error('KIOT_BASE_URL environment variable is not configured');
    }
    this.baseUrl = baseUrl;

    const clientId = this.configService.get('KIOTVIET_CLIENT_ID');
    if (!clientId) {
      throw new Error(
        'KIOTVIET_CLIENT_ID environment variable is not configured',
      );
    }
    this.clientId = clientId;

    const clientSecret = this.configService.get('KIOTVIET_CLIENT_SECRET');
    if (!clientSecret) {
      throw new Error(
        'KIOTVIET_CLIENT_SECRET environment variable is not configured',
      );
    }
    this.clientSecret = clientSecret;

    const retailerName = this.configService.get('KIOTVIET_RETAILER_NAME');
    if (!retailerName) {
      throw new Error(
        'KIOTVIET_RETAILER_NAME environment variable is not configured',
      );
    }
    this.retailerName = retailerName;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    try {
      const tokenUrl = this.configService.get('KIOT_TOKEN');
      const response = await firstValueFrom(
        this.httpService.post(
          tokenUrl,
          {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'client_credentials',
            scopes: 'PublicApi.Access',
          },
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );

      this.accessToken = response.data.access_token;
      return this.accessToken;
    } catch (error) {
      this.logger.error('Failed to get KiotViet access token:', error);
      throw error;
    }
  }

  async createCustomer(customerData: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    provinceDistrict?: string;
    ward?: string;
  }): Promise<any> {
    const token = await this.getAccessToken();

    const payload = {
      name: customerData.name,
      contactNumber: customerData.phone,
      email: customerData.email || '',
      address:
        `${customerData.address || ''}, ${customerData.ward || ''}, ${customerData.provinceDistrict || ''}`
          .trim()
          .replace(/^,\s*|,\s*$/g, ''),
      wardName: customerData.ward || '',
      locationName: customerData.provinceDistrict || '',
      comments: `Khách hàng web - ${new Date().toISOString()}`,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/customers`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.retailerName,
            'Content-Type': 'application/json',
          },
        }),
      );

      this.logger.log(`✅ Created KiotViet customer: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        'Failed to create KiotViet customer:',
        error.response?.data || error,
      );
      throw error;
    }
  }

  async createOrder(orderData: {
    customerId: number;
    customerName: string;
    items: Array<{
      productId: number;
      productCode: string;
      productName: string;
      quantity: number;
      price: number;
    }>;
    total: number;
    description?: string;
  }): Promise<any> {
    const token = await this.getAccessToken();

    const orderDetails = orderData.items.map((item) => ({
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      quantity: item.quantity,
      price: item.price,
      isMaster: true,
    }));

    const payload = {
      purchaseDate: new Date().toISOString(),
      branchId: 1,
      discount: 0,
      description: orderData.description || 'Đơn hàng từ website',
      method: 'Cash',
      totalPayment: orderData.total,
      customer: {
        id: orderData.customerId,
        name: orderData.customerName,
      },
      orderDetails,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/orders`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.retailerName,
            'Content-Type': 'application/json',
          },
        }),
      );

      this.logger.log(`✅ Created KiotViet order: ${response.data.code}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        'Failed to create KiotViet order:',
        error.response?.data || error,
      );
      throw error;
    }
  }
}
