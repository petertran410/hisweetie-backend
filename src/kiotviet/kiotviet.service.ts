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

    const cleanProvinceName = (province: string): string => {
      if (!province) return '';

      return province.replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();
    };

    const payload: any = {
      name: customerData.name,
      contactNumber: customerData.phone,
      address: customerData.address || '',
      branchId: 635934,
    };

    if (customerData.email?.trim()) {
      payload.email = customerData.email.trim();
    }

    if (customerData.ward?.trim()) {
      payload.wardName = customerData.ward.trim();
    }

    if (customerData.province?.trim()) {
      const cleanedProvince = cleanProvinceName(customerData.province);
      const originalDistrict = customerData.district?.trim() || '';

      payload.locationName = [cleanedProvince, originalDistrict]
        .filter(Boolean)
        .join(' - ');
    }

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
      this.logger.error(
        '❌ Create customer failed:',
        JSON.stringify(error.response?.data, null, 2),
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

    // ✅ DEBUG: Log input data
    this.logger.log(
      '🔍 CREATE ORDER INPUT:',
      JSON.stringify(
        {
          customerId: orderData.customerId,
          customerName: orderData.customerName,
          customerNameLength: orderData.customerName?.length,
          customerNameType: typeof orderData.customerName,
          itemsCount: orderData.items.length,
          total: orderData.total,
        },
        null,
        2,
      ),
    );

    // ✅ Check if customerName is empty
    if (!orderData.customerName || orderData.customerName.trim() === '') {
      throw new Error(`Customer name is empty: "${orderData.customerName}"`);
    }

    const orderDetails = orderData.items.map((item) => ({
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      quantity: item.quantity,
      price: item.price,
      isMaster: true,
    }));

    const payload: any = {
      purchaseDate: new Date().toISOString(),
      branchId: 635934,
      discount: 0,
      description: orderData.description || '',
      method: 'Cash',
      totalPayment: orderData.total,
      customer: {
        id: orderData.customerId,
        name: orderData.customerName.trim(), // ✅ Trim name
      },
      orderDetails,
    };

    // ✅ DEBUG: Log exact payload
    this.logger.log('🔍 ORDER PAYLOAD:', JSON.stringify(payload, null, 2));

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

      this.logger.log(`✅ Created order: ${response.data.code}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        '❌ Create order failed:',
        JSON.stringify(error.response?.data, null, 2),
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
