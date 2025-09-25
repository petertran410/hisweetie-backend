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

  // ✅ FIX: Validate branch trước khi tạo customer/order
  async validateBranchId(): Promise<void> {
    const token = await this.getAccessToken();

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/branches`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.retailerName,
          },
        }),
      );

      this.logger.log('Available branches:', response.data.data);

      const validBranch = response.data.data.find(
        (branch) => branch.id === this.websiteBranchId,
      );
      if (!validBranch) {
        throw new Error(
          `❌ Branch ID ${this.websiteBranchId} not found! Available branches: ${response.data.data.map((b) => `${b.id}(${b.branchName})`).join(', ')}`,
        );
      }

      this.logger.log('✅ Valid branch found:', validBranch);
    } catch (error) {
      this.logger.error(
        '❌ Branch validation failed:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async createCustomer(customerData: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    province?: string;
    ward?: string;
    district?: string;
  }): Promise<any> {
    const token = await this.getAccessToken();

    const payload = {
      name: customerData.name,
      contactNumber: customerData.phone,
      email: customerData.email || '',
      address:
        `${customerData.address || ''}, ${customerData.ward || ''}, ${customerData.province || ''}`
          .trim()
          .replace(/^,\s*|,\s*$/g, ''),
      wardName: customerData.ward || '',
      locationName: [customerData.province, customerData.district]
        .filter(Boolean)
        .join(' - '),
      comments: `KHÁCH HÀNG TỪ WEBSITE - ${new Date().toLocaleString('vi-VN')}`,
      branchId: 635934,
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

      this.logger.log(
        `✅ Created customer: ${response.data.id} (${response.data.name})`,
      );
      return response.data;
    } catch (error) {
      this.logger.error('❌ Create customer failed:', error.response?.data);
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
    // ✅ Validate branch trước khi tạo
    await this.validateBranchId();

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
      branchId: this.websiteBranchId, // ✅ SINGLE VALUE cho order API
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
    this.logger.log(`Order payload:`, payload);

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
      return response.data;
    } catch (error) {
      this.logger.error(
        '❌ Failed to create KiotViet order:',
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      throw error;
    }
  }

  // ✅ Method để handle payment success từ Sepay
  async handlePaymentSuccess(paymentData: {
    customerName: string;
    phone: string;
    email?: string;
    address?: string;
    items: Array<{
      productId: number;
      productCode: string;
      productName: string;
      quantity: number;
      price: number;
    }>;
    amount: number;
    orderId: string;
    note?: string;
  }): Promise<{ customer: any; order: any }> {
    try {
      this.logger.log(
        `🔄 Processing payment success for order: ${paymentData.orderId}`,
      );

      // 1. Tạo customer trước
      const customer = await this.createCustomer({
        name: paymentData.customerName,
        phone: paymentData.phone,
        email: paymentData.email,
        address: paymentData.address,
      });

      // 2. Tạo order với customerId từ step 1
      const order = await this.createOrder({
        customerId: customer.id,
        customerName: customer.name,
        items: paymentData.items,
        total: paymentData.amount,
        description: `Web order #${paymentData.orderId} - ${paymentData.note || ''}`,
      });

      this.logger.log(
        `✅ Successfully processed payment for order: ${paymentData.orderId}`,
      );
      return { customer, order };
    } catch (error) {
      this.logger.error(
        `❌ Failed to process payment for order ${paymentData.orderId}:`,
        error.message,
      );
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.validateBranchId();

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
