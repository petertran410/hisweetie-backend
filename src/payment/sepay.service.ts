// src/payment/sepay.service.ts - FIXED VERSION
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
    // Get configuration values with proper null checking
    const apiKey = this.configService.get<string>('SEPAY_API_KEY');
    const secretKey = this.configService.get<string>('SEPAY_SECRET_KEY');
    const partnerCode = this.configService.get<string>('SEPAY_PARTNER_CODE');
    const baseUrl =
      this.configService.get<string>('SEPAY_BASE_URL') ||
      'https://my.sepay.vn/userapi';
    const webhookUrl =
      this.configService.get<string>('SEPAY_WEBHOOK_URL') || '';

    // Validate required configuration
    if (!apiKey || !secretKey || !partnerCode) {
      const missingVars = [];
      if (!apiKey) missingVars.push('SEPAY_API_KEY');
      if (!secretKey) missingVars.push('SEPAY_SECRET_KEY');
      if (!partnerCode) missingVars.push('SEPAY_PARTNER_CODE');

      throw new Error(
        `SePay configuration is missing required environment variables: ${missingVars.join(', ')}. ` +
          'Please set these variables in your .env file.',
      );
    }

    this.config = {
      apiKey,
      secretKey,
      partnerCode,
      baseUrl,
      webhookUrl,
    };

    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    // Add request/response interceptors for better debugging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.logger.debug(
          `SePay API Request: ${config.method?.toUpperCase()} ${config.url}`,
        );
        return config;
      },
      (error) => {
        this.logger.error('SePay API Request Error:', error.message);
        return Promise.reject(error);
      },
    );

    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.logger.debug(
          `SePay API Response: ${response.status} ${response.statusText}`,
        );
        return response;
      },
      (error) => {
        this.logger.error(
          'SePay API Response Error:',
          error.response?.data || error.message,
        );
        return Promise.reject(error);
      },
    );

    this.logger.log('SePay service initialized successfully');
  }

  /**
   * Generate signature for SePay API requests
   */
  private generateSignature(data: Record<string, any>): string {
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
  verifyWebhookSignature(
    data: Record<string, any>,
    receivedSignature: string,
  ): boolean {
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
          `${this.configService.get('FRONTEND_URL') || 'http://localhost:3000'}/thanh-toan/success`,
        notify_url: request.notifyUrl || this.config.webhookUrl,
        timestamp: Date.now(),
      };

      // Generate signature
      const signature = this.generateSignature(paymentData);
      const requestPayload = { ...paymentData, signature };

      this.logger.debug('SePay payment request data (signature hidden):', {
        ...paymentData,
        signature: '***HIDDEN***',
      });

      const response = await this.axiosInstance.post(
        '/create-payment',
        requestPayload,
      );

      if (response.data?.success) {
        this.logger.log(
          `SePay payment created successfully: ${request.orderCode}`,
        );
        return {
          success: true,
          message: 'Payment created successfully',
          data: {
            orderCode: request.orderCode,
            paymentUrl: response.data.data?.payment_url || '',
            qrCodeUrl: response.data.data?.qr_code_url || '',
            transactionId: response.data.data?.transaction_id || '',
            amount: request.amount,
            status: 'PENDING',
          },
        };
      } else {
        throw new Error(response.data?.message || 'Failed to create payment');
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
      const requestPayload = { ...requestData, signature };

      const response = await this.axiosInstance.post(
        '/check-payment',
        requestPayload,
      );

      if (response.data?.success) {
        return {
          success: true,
          status: response.data.data?.status || 'UNKNOWN',
          transactionId: response.data.data?.transaction_id,
          amount: response.data.data?.amount,
          message: response.data.message,
        };
      } else {
        return {
          success: false,
          status: 'UNKNOWN',
          message: response.data?.message || 'Failed to check payment status',
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
      const requestPayload = { ...requestData, signature };

      const response = await this.axiosInstance.post(
        '/cancel-payment',
        requestPayload,
      );

      return {
        success: response.data?.success || false,
        message: response.data?.message || 'Payment cancellation processed',
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
      const requestPayload = { ...requestData, signature };

      const response = await this.axiosInstance.post(
        '/generate-qr',
        requestPayload,
      );

      if (response.data?.success) {
        return {
          success: true,
          qrCodeUrl: response.data.data?.qr_code_url,
          qrCodeData: response.data.data?.qr_code_data,
          message: 'QR code generated successfully',
        };
      } else {
        return {
          success: false,
          message: response.data?.message || 'Failed to generate QR code',
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
      const requestPayload = { ...requestData, signature };

      const response = await this.axiosInstance.post(
        '/payment-methods',
        requestPayload,
      );

      if (response.data?.success) {
        return {
          success: true,
          methods: response.data.data?.methods || [],
          message: 'Payment methods retrieved successfully',
        };
      } else {
        return {
          success: false,
          message: response.data?.message || 'Failed to get payment methods',
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
      const requestPayload = { ...testData, signature };

      const response = await this.axiosInstance.post(
        '/test-connection',
        requestPayload,
      );

      const success = response.data?.success || response.status === 200;
      return {
        success,
        message: success
          ? `Successfully connected to SePay for partner: ${this.config.partnerCode}`
          : response.data?.message ||
            'Connection test completed but response was unclear',
      };
    } catch (error) {
      this.logger.error('SePay connection test failed:', error.message);

      // Provide more helpful error messages
      let message = `Connection failed: ${error.message}`;

      if (error.code === 'ECONNREFUSED') {
        message = 'Connection refused - SePay servers may be unavailable';
      } else if (error.response?.status === 401) {
        message =
          'Authentication failed - please check your SePay API credentials';
      } else if (error.response?.status === 403) {
        message =
          'Access forbidden - please check your SePay partner code and permissions';
      } else if (error.response?.status >= 500) {
        message = 'SePay server error - please try again later';
      }

      return {
        success: false,
        message,
      };
    }
  }

  /**
   * Get current configuration (for debugging - sensitive data hidden)
   */
  getConfig(): Partial<SepayConfig> {
    return {
      baseUrl: this.config.baseUrl,
      webhookUrl: this.config.webhookUrl,
      partnerCode: this.config.partnerCode,
      // Hide sensitive data
      apiKey: this.config.apiKey ? '***CONFIGURED***' : 'NOT SET',
      secretKey: this.config.secretKey ? '***CONFIGURED***' : 'NOT SET',
    };
  }
}
