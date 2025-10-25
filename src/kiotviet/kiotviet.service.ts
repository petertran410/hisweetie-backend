import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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

  private convertPhoneToInternational(phone: string): string {
    if (!phone) return '';

    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

    if (cleanPhone.startsWith('+84')) {
      return cleanPhone;
    }

    if (cleanPhone.startsWith('84')) {
      return `+${cleanPhone}`;
    }

    if (cleanPhone.startsWith('0')) {
      return `+84${cleanPhone.substring(1)}`;
    }

    return `+84${cleanPhone}`;
  }

  async checkCustomerExistsByPhone(
    phone: string,
  ): Promise<{ exists: boolean; customer?: any }> {
    const token = await this.getAccessToken();
    const internationalPhone = this.convertPhoneToInternational(phone);

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/customers`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.retailerName,
          },
          params: {
            pageSize: 100,
            currentItem: 0,
          },
        }),
      );

      const customers = response.data.data || [];

      const existingCustomer = customers.find((c: any) => {
        const customerPhone = c.contactNumber?.replace(/[\s\-\(\)]/g, '');
        const searchPhone1 = phone.replace(/[\s\-\(\)]/g, '');
        const searchPhone2 = internationalPhone.replace(/[\s\-\(\)]/g, '');

        return customerPhone === searchPhone1 || customerPhone === searchPhone2;
      });

      if (existingCustomer) {
        this.logger.log(`Customer exists on KiotViet with phone: ${phone}`);
        return { exists: true, customer: existingCustomer };
      }

      return { exists: false };
    } catch (error) {
      this.logger.error('Error checking customer existence:', error.message);
      return { exists: false };
    }
  }

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
    email: string | undefined;
    address?: string;
    province?: string;
    ward?: string;
    district?: string;
    clientId?: number;
  }): Promise<any> {
    const token = await this.getAccessToken();

    const internationalPhone = this.convertPhoneToInternational(
      customerData.phone,
    );

    const cleanProvinceName = (province: string): string => {
      if (!province) return '';
      return province.replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();
    };

    const payload: any = {
      name: customerData.name,
      contactNumber: internationalPhone,
      address: customerData.address || '',
      branchId: 635934,
    };

    if (customerData.clientId) {
      payload.code = this.generateCustomerCode(customerData.clientId);
    }

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
        '🔍 FULL API RESPONSE:',
        JSON.stringify(response.data, null, 2),
      );
      this.logger.log('🔍 RESPONSE KEYS:', Object.keys(response.data || {}));
      this.logger.log(
        '🔍 DATA FIELD:',
        JSON.stringify(response.data.data, null, 2),
      );

      const customerData = response.data.data || response.data;

      this.logger.log(
        `✅ Created customer: ${customerData.id} (${customerData.name}) with code: ${customerData.code}`,
      );
      return customerData;
    } catch (error) {
      this.logger.error(
        '❌ Create customer failed:',
        JSON.stringify(error.response?.data, null, 2),
      );
      throw error;
    }
  }

  async updateCustomer(
    customerId: number,
    customerData: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      province?: string;
      ward?: string;
      district?: string;
    },
  ): Promise<any> {
    const token = await this.getAccessToken();

    const cleanProvinceName = (province: string): string => {
      if (!province) return '';
      return province.replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();
    };

    const payload: any = {};

    if (customerData.name) payload.name = customerData.name;

    if (customerData.phone) {
      payload.contactNumber = this.convertPhoneToInternational(
        customerData.phone,
      );
    }

    if (customerData.email) payload.email = customerData.email.trim();

    if (customerData.address) payload.address = customerData.address;

    if (customerData.ward) {
      payload.wardName = customerData.ward.trim();
    }

    if (customerData.province) {
      const cleanedProvince = cleanProvinceName(customerData.province);
      const originalDistrict = customerData.district || '';
      payload.locationName = [cleanedProvince, originalDistrict]
        .filter(Boolean)
        .join(' - ');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.put(
          `${this.baseUrl}/customers/${customerId}`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Retailer: this.retailerName,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const updatedCustomer = response.data.data || response.data;
      this.logger.log(
        `✅ Updated customer: ${customerId} (${updatedCustomer.name})`,
      );
      return updatedCustomer;
    } catch (error) {
      this.logger.error(
        '❌ Update customer failed:',
        JSON.stringify(error.response?.data, null, 2),
      );
      throw error;
    }
  }

  private generateCustomerCode(clientId: number): string {
    const paddedId = clientId.toString().padStart(9, '0');
    return `KHWEB${paddedId}`;
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
    deliveryInfo?: {
      receiver: string;
      contactNumber: string;
      address: string;
      locationName?: string;
      wardName?: string;
    };
  }): Promise<any> {
    const token = await this.getAccessToken();

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
      method: 'Transfer',
      totalPayment: orderData.total,
      saleChannelId: 496738,
      customer: {
        id: orderData.customerId,
        name: orderData.customerName.trim(),
      },
      orderDetails,
    };

    if (orderData.deliveryInfo) {
      payload.orderDelivery = {
        receiver: orderData.deliveryInfo.receiver,
        contactNumber: orderData.deliveryInfo.contactNumber,
        address: orderData.deliveryInfo.address,
        locationName: orderData.deliveryInfo.locationName || '',
        wardName: orderData.deliveryInfo.wardName || '',
      };
    }

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

  async createCODOrder(orderData: {
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
    deliveryInfo?: {
      receiver: string;
      contactNumber: string;
      address: string;
      locationName?: string;
      wardName?: string;
    };
  }): Promise<any> {
    const token = await this.getAccessToken();

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
      total: orderData.total,
      saleChannelId: 496738,
      customer: {
        id: orderData.customerId,
        name: orderData.customerName.trim(),
      },
      orderDetails,
    };

    if (orderData.deliveryInfo) {
      payload.orderDelivery = {
        receiver: orderData.deliveryInfo.receiver,
        contactNumber: orderData.deliveryInfo.contactNumber,
        address: orderData.deliveryInfo.address,
        locationName: orderData.deliveryInfo.locationName || '',
        wardName: orderData.deliveryInfo.wardName || '',
      };
    }

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

  async deleteOrder(orderId: number): Promise<any> {
    const token = await this.getAccessToken();

    try {
      const response = await firstValueFrom(
        this.httpService.delete(
          `${this.baseUrl}/orders/${orderId}?IsVoidPayment=false`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Retailer: this.retailerName,
            },
          },
        ),
      );

      this.logger.log(`✅ Deleted order: ${orderId}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `❌ Delete order failed: ${orderId}`,
        error.response?.data,
      );
      throw error;
    }
  }

  async handleOrderWebhook(webhookData: any): Promise<void> {
    try {
      const { Id, Attempt, Notifications } = webhookData;

      if (!Notifications || Notifications.length === 0) {
        this.logger.warn('⚠️ Webhook has no notifications');
        return;
      }

      for (const notification of Notifications) {
        const { Action, Data } = notification;

        if (!Data || Data.length === 0) {
          continue;
        }

        for (const orderData of Data) {
          const {
            Id: orderId,
            Code,
            SaleChannelId,
            Status,
            StatusValue,
          } = orderData;

          if (SaleChannelId !== 496738) {
            this.logger.log(
              `⏭️ Skipping order ${Code} - SaleChannelId ${SaleChannelId} not 496738`,
            );
            continue;
          }

          this.logger.log(
            `🔄 Processing order ${Code} with status ${Status} (${StatusValue})`,
          );

          let newStatus: string | null = null;

          if (Status === 5) {
            newStatus = 'CONFIRMED';
            this.logger.log(`✅ Order ${Code} → CONFIRMED (Đã nhận đơn)`);
          } else if (Status === 3) {
            newStatus = 'SHIPPING';
            this.logger.log(`🚚 Order ${Code} → SHIPPING (Đang giao hàng)`);
          } else if (Status === 4) {
            newStatus = 'CANCELLED';
            this.logger.log(
              `🚚 Order ${Code} → CANCELLED (Đơn hàng đã được hủy)`,
            );
          } else {
            this.logger.log(
              `ℹ️ Order ${Code} status ${Status} not mapped, skipping`,
            );
            continue;
          }

          if (newStatus) {
            await this.updateOrderStatusByKiotId(orderId, newStatus, {
              kiotOrderId: orderId,
              kiotOrderCode: Code,
              saleChannelId: SaleChannelId,
              kiotStatus: Status,
              kiotStatusValue: StatusValue,
              webhookId: Id,
              attempt: Attempt,
              action: Action,
            });
          }
        }
      }

      this.forwardRawWebhookData(webhookData);
    } catch (error) {
      this.logger.error('❌ handleOrderWebhook error:', error);
      throw error;
    }
  }

  private async updateOrderStatusByKiotId(
    kiotOrderId: number,
    newStatus: string,
    webhookInfo: any,
  ): Promise<void> {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const order = await prisma.product_order.findFirst({
        where: { order_kiot_id: kiotOrderId },
      });

      if (!order) {
        this.logger.warn(`⚠️ Order not found for KiotViet ID: ${kiotOrderId}`);
        return;
      }

      await prisma.product_order.update({
        where: { id: order.id },
        data: {
          status: newStatus,
          updated_date: new Date(),
        },
      });

      await prisma.webhook_log.create({
        data: {
          webhook_type: 'kiotviet.order.update',
          payload: webhookInfo,
          processed: true,
          created_at: new Date(),
        },
      });

      await prisma.payment_logs.create({
        data: {
          order_id: order.id,
          event_type: 'KIOTVIET_ORDER_STATUS_UPDATE',
          event_data: {
            oldStatus: order.status,
            newStatus: newStatus,
            webhookInfo: webhookInfo,
          },
          created_date: new Date(),
          ip_address: 'KIOTVIET_WEBHOOK',
          user_agent: 'KIOTVIET_WEBHOOK_HANDLER',
        },
      });

      this.logger.log(
        `✅ Updated order ${order.id} status from ${order.status} to ${newStatus}`,
      );
    } catch (error) {
      this.logger.error('❌ updateOrderStatusByKiotId error:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  private async forwardRawWebhookData(rawWebhookData: any): Promise<void> {
    const endpoints = [
      'https://2svn.dieptra.com/webhook/webhook-kiotviet-website',
      'https://kiot.hisweetievietnam.com/webhook/order',
      'https://dieptra2018.sg.larksuite.com/base/workflow/webhook/event/Gj0Ja8vlEwUjdzh75mElZgIogrf',
      'https://2svn.dieptra.com/webhook-test/take-order-webhook-from-kiotviet',
    ];

    await Promise.allSettled(
      endpoints.map(async (url) => {
        try {
          this.logger.log(`🔄 Forwarding to ${url}...`);
          const response = await firstValueFrom(
            this.httpService.post(url, rawWebhookData, { timeout: 5000 }),
          );
          this.logger.log(`✅ Forwarded to ${url}. Status: ${response.status}`);
        } catch (error) {
          this.logger.error(`⚠️ Failed forward to ${url}: ${error.message}`);
        }
      }),
    );
  }

  async getInvoiceByCode(invoiceCode: string): Promise<any> {
    try {
      const accessToken = await this.getAccessToken();
      const url = `${this.baseUrl}/invoices/code/${invoiceCode}`;

      this.logger.log(`🔍 Fetching invoice by code: ${invoiceCode}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Retailer: this.retailerName,
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        '❌ getInvoiceByCode error:',
        error.response?.data || error.message,
      );
      throw new BadRequestException(
        `Cannot fetch invoice: ${error.response?.data?.message || error.message}`,
      );
    }
  }
}
