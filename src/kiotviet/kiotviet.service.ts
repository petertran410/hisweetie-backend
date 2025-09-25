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
  private readonly websiteBranchId = 635934;
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

    this.logger.log(
      `🏪 Using website branch: Cửa Hàng Diệp Trà (ID: ${this.websiteBranchId})`,
    );
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
      this.logger.log('✅ KiotViet access token obtained successfully');
      return this.accessToken;
    } catch (error) {
      this.logger.error(
        'Failed to get KiotViet access token:',
        error.response?.data || error,
      );
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

    const websiteCustomerNote = `KHÁCH HÀNG TỪ WEBSITE - Đăng ký: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} | Nguồn: dieptra.com`;

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
      comments: websiteCustomerNote,
      branchId: [this.websiteBranchId],
    };

    this.logger.log(
      `📝 Creating customer for branch: Cửa Hàng Diệp Trà (${this.websiteBranchId})`,
    );
    this.logger.log(`Customer data:`, {
      name: payload.name,
      phone: payload.contactNumber,
      branchId: payload.branchId,
      comments: payload.comments,
    });

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

      this.logger.log(
        `✅ Created KiotViet customer: ${response.data.id} (${response.data.name})`,
      );
      this.logger.log(`📝 Customer comments: ${websiteCustomerNote}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        '❌ Failed to create KiotViet customer:',
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

    const websiteNote = `ĐƠN HÀNG TỪ WEBSITE - ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
    const customerNote = orderData.description
      ? ` | Ghi chú KH: ${orderData.description}`
      : '';
    const finalDescription = `${websiteNote}${customerNote}`;

    const payload = {
      purchaseDate: new Date().toISOString(),
      branchId: this.websiteBranchId,
      discount: 0,
      description: finalDescription,
      method: 'Cash',
      totalPayment: orderData.total,
      customer: {
        id: orderData.customerId,
        name: orderData.customerName,
      },
      orderDetails,
    };

    this.logger.log(
      `📦 Creating order for branch: Cửa Hàng Diệp Trà (${this.websiteBranchId})`,
    );
    this.logger.log(`Order data:`, {
      customerId: orderData.customerId,
      customerName: orderData.customerName,
      itemsCount: orderData.items.length,
      total: orderData.total,
      branchId: this.websiteBranchId,
      description: finalDescription,
    });

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

      this.logger.log(
        `✅ Created KiotViet order: ${response.data.code} (Total: ${orderData.total})`,
      );
      this.logger.log(`📝 Order description: ${finalDescription}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        '❌ Failed to create KiotViet order:',
        error.response?.data || error,
      );
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.getAccessToken();

      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/customers?pageSize=1`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.retailerName,
            'Content-Type': 'application/json',
          },
        }),
      );

      return {
        success: true,
        message: `Connected successfully to KiotViet. Using branch: Cửa Hàng Diệp Trà (ID: ${this.websiteBranchId})`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
      };
    }
  }

  getBranchInfo(): { id: number; name: string } {
    return {
      id: this.websiteBranchId,
      name: 'Cửa Hàng Diệp Trà',
    };
  }
}
