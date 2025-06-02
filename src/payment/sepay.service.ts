// src/payment/sepay.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

interface SepayConfig {
  apiKey: string;
  secretKey: string;
  partnerCode: string;
  baseUrl: string;
  webhookUrl: string;
}

interface CreatePaymentRequest {
  orderCode: string;
  amount: number;
  orderInfo: string;
  customerInfo: {
    fullName: string;
    email: string;
    phone: string;
  };
  paymentMethod: string;
  returnUrl?: string;
  notifyUrl?: string;
}

interface SepayPaymentResponse {
  success: boolean;
  message: string;
  data?: {
    orderCode: string;
    paymentUrl: string;
    qrCodeUrl: string;
    transactionId: string;
    amount: number;
    status: string;
  };
  error?: string;
}

@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly config: SepayConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      apiKey: this.configService.get<string>('SEPAY_API_KEY'),
      secretKey: this.configService.get<string>('SEPAY_SECRET_KEY'),
      partnerCode: this.configService.get<string>('SEPAY_PARTNER_CODE'),
      baseUrl:
        this.configService.get<string>('SEPAY_BASE_URL') ||
        'https://my.sepay.vn/userapi',
      webhookUrl: this.configService.get<string>('SEPAY_WEBHOOK_URL'),
    };

    if (
      !this.config.apiKey ||
      !this.config.secretKey ||
      !this.config.partnerCode
    ) {
      throw new Error(
        'SePay configuration is missing. Please set SEPAY_API_KEY, SEPAY_SECRET_KEY, and SEPAY_PARTNER_CODE',
      );
    }

    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    this.logger.log('SePay service initialized successfully');
  }

  /**
   * Generate signature for SePay API requests
   */
  private generateSignature(data: any): string {
    try {
      // Sort parameters and create signature string
      const sortedKeys = Object.keys(data).sort();
      const signatureData = sortedKeys
        .map((key) => `${key}=${data[key]}`)
        .join('&');

      const signatureString = `${signatureData}&key=${this.config.secretKey}`;

      return crypto
        .createHash('md5')
        .update(signatureString)
        .digest('hex')
        .toUpperCase();
    } catch (error) {
      this.logger.error('Error generating signature:', error.message);
      throw new BadRequestException('Failed to generate payment signature');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(data: any, receivedSignature: string): boolean {
    try {
      const expectedSignature = this.generateSignature(data);
      return expectedSignature === receivedSignature;
    } catch (error) {
      this.logger.error('Error verifying webhook signature:', error.message);
      return false;
    }
  }

  /**
   * Create payment order with SePay
   */
  async createPayment(
    request: CreatePaymentRequest,
  ): Promise<SepayPaymentResponse> {
    try {
      this.logger.log(`Creating SePay payment for order: ${request.orderCode}`);

      const paymentData = {
        partner_code: this.config.partnerCode,
        order_code: request.orderCode,
        amount: request.amount,
        order_info: request.orderInfo,
        customer_name: request.customerInfo.fullName,
        customer_email: request.customerInfo.email,
        customer_phone: request.customerInfo.phone,
        payment_method: request.paymentMethod,
        return_url:
          request.returnUrl ||
          `${this.configService.get('FRONTEND_URL')}/thanh-toan/success`,
        notify_url: request.notifyUrl || this.config.webhookUrl,
        timestamp: Date.now(),
      };

      // Generate signature
      const signature = this.generateSignature(paymentData);
      paymentData['signature'] = signature;

      this.logger.debug('SePay payment request data:', {
        ...paymentData,
        signature: '***HIDDEN***',
      });

      const response = await this.axiosInstance.post(
        '/create-payment',
        paymentData,
      );

      if (response.data.success) {
        this.logger.log(
          `SePay payment created successfully: ${request.orderCode}`,
        );
        return {
          success: true,
          message: 'Payment created successfully',
          data: {
            orderCode: request.orderCode,
            paymentUrl: response.data.data.payment_url,
            qrCodeUrl: response.data.data.qr_code_url,
            transactionId: response.data.data.transaction_id,
            amount: request.amount,
            status: 'PENDING',
          },
        };
      } else {
        throw new Error(response.data.message || 'Failed to create payment');
      }
    } catch (error) {
      this.logger.error(
        `SePay payment creation failed for ${request.orderCode}:`,
        error.message,
      );

      if (error.response?.data) {
        this.logger.error('SePay API error response:', error.response.data);
      }

      return {
        success: false,
        message: error.message || 'Failed to create payment',
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Check payment status with SePay
   */
  async checkPaymentStatus(orderCode: string): Promise<{
    success: boolean;
    status: string;
    transactionId?: string;
    amount?: number;
    message?: string;
  }> {
    try {
      this.logger.log(`Checking payment status for order: ${orderCode}`);

      const requestData = {
        partner_code: this.config.partnerCode,
        order_code: orderCode,
        timestamp: Date.now(),
      };

      const signature = this.generateSignature(requestData);
      requestData['signature'] = signature;

      const response = await this.axiosInstance.post(
        '/check-payment',
        requestData,
      );

      if (response.data.success) {
        return {
          success: true,
          status: response.data.data.status,
          transactionId: response.data.data.transaction_id,
          amount: response.data.data.amount,
          message: response.data.message,
        };
      } else {
        return {
          success: false,
          status: 'UNKNOWN',
          message: response.data.message || 'Failed to check payment status',
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to check payment status for ${orderCode}:`,
        error.message,
      );
      return {
        success: false,
        status: 'ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(orderCode: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      this.logger.log(`Cancelling payment for order: ${orderCode}`);

      const requestData = {
        partner_code: this.config.partnerCode,
        order_code: orderCode,
        timestamp: Date.now(),
      };

      const signature = this.generateSignature(requestData);
      requestData['signature'] = signature;

      const response = await this.axiosInstance.post(
        '/cancel-payment',
        requestData,
      );

      return {
        success: response.data.success,
        message: response.data.message || 'Payment cancellation processed',
      };
    } catch (error) {
      this.logger.error(
        `Failed to cancel payment for ${orderCode}:`,
        error.message,
      );
      return {
        success: false,
        message: error.message || 'Failed to cancel payment',
      };
    }
  }

  /**
   * Generate QR code for bank transfer
   */
  async generateQRCode(
    orderCode: string,
    amount: number,
    bankCode?: string,
  ): Promise<{
    success: boolean;
    qrCodeUrl?: string;
    qrCodeData?: string;
    message?: string;
  }> {
    try {
      this.logger.log(`Generating QR code for order: ${orderCode}`);

      const requestData = {
        partner_code: this.config.partnerCode,
        order_code: orderCode,
        amount: amount,
        bank_code: bankCode || 'VCB', // Default to Vietcombank
        timestamp: Date.now(),
      };

      const signature = this.generateSignature(requestData);
      requestData['signature'] = signature;

      const response = await this.axiosInstance.post(
        '/generate-qr',
        requestData,
      );

      if (response.data.success) {
        return {
          success: true,
          qrCodeUrl: response.data.data.qr_code_url,
          qrCodeData: response.data.data.qr_code_data,
          message: 'QR code generated successfully',
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Failed to generate QR code',
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate QR code for ${orderCode}:`,
        error.message,
      );
      return {
        success: false,
        message: error.message || 'Failed to generate QR code',
      };
    }
  }

  /**
   * Get supported payment methods
   */
  async getPaymentMethods(): Promise<{
    success: boolean;
    methods?: Array<{
      code: string;
      name: string;
      type: string;
      enabled: boolean;
    }>;
    message?: string;
  }> {
    try {
      const requestData = {
        partner_code: this.config.partnerCode,
        timestamp: Date.now(),
      };

      const signature = this.generateSignature(requestData);
      requestData['signature'] = signature;

      const response = await this.axiosInstance.post(
        '/payment-methods',
        requestData,
      );

      if (response.data.success) {
        return {
          success: true,
          methods: response.data.data.methods,
          message: 'Payment methods retrieved successfully',
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Failed to get payment methods',
        };
      }
    } catch (error) {
      this.logger.error('Failed to get payment methods:', error.message);
      return {
        success: false,
        message: error.message || 'Failed to get payment methods',
      };
    }
  }

  /**
   * Test SePay connection
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      this.logger.log('Testing SePay connection');

      const testData = {
        partner_code: this.config.partnerCode,
        timestamp: Date.now(),
      };

      const signature = this.generateSignature(testData);
      testData['signature'] = signature;

      const response = await this.axiosInstance.post(
        '/test-connection',
        testData,
      );

      return {
        success: response.data.success,
        message: response.data.message || 'Connection test completed',
      };
    } catch (error) {
      this.logger.error('SePay connection test failed:', error.message);
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
      };
    }
  }
}
