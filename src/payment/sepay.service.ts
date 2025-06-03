// src/payment/sepay.service.ts - CORRECT Implementation for SePay
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SepayConfig {
  apiToken: string;
  bankAccount: string;
  bankName: string;
  accountHolder: string;
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
    qrCodeUrl: string; // VietQR URL
    qrCodeData: string; // QR code content
    bankInfo: {
      accountNumber: string;
      accountHolder: string;
      bankName: string;
      amount: number;
      transferContent: string;
    };
    amount: number;
    status: string;
  };
  error?: string;
}

// SePay webhook payload structure
export interface SepayWebhookPayload {
  id: number; // Transaction ID on SePay
  gateway: string; // Bank name (e.g., "Vietcombank")
  transactionDate: string; // Transaction time "2023-03-25 14:02:37"
  accountNumber: string; // Bank account number
  code: string | null; // Payment code (auto-detected by SePay)
  content: string; // Transfer content
  transferType: 'in' | 'out'; // Transaction type
  transferAmount: number; // Transaction amount
  accumulated: number; // Account balance
  subAccount: string | null; // Sub account
  referenceCode: string; // SMS reference code
  description: string; // Full SMS content
}

@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);
  private readonly config: SepayConfig;

  constructor(private readonly configService: ConfigService) {
    // Get SePay configuration
    const apiToken = this.configService.get('SEPAY_API_TOKEN') as string;
    const bankAccount = this.configService.get('SEPAY_BANK_ACCOUNT') as string;
    const bankName = this.configService.get('SEPAY_BANK_NAME') as string;
    const accountHolder = this.configService.get(
      'SEPAY_ACCOUNT_HOLDER',
    ) as string;
    const webhookUrl = this.configService.get('SEPAY_WEBHOOK_URL') as string;

    if (!apiToken) {
      this.logger.warn(
        'SEPAY_API_TOKEN is not configured. SePay webhook authentication will fail.',
      );
    }

    if (!bankAccount || !bankName || !accountHolder) {
      this.logger.warn(
        'SePay bank information is incomplete. Payment QR codes cannot be generated.',
      );
    }

    this.config = {
      apiToken: apiToken || '',
      bankAccount: bankAccount || '',
      bankName: bankName || '',
      accountHolder: accountHolder || '',
      webhookUrl: webhookUrl || '',
    };

    this.logger.log(
      `SePay service initialized. API Token: ${!!this.config.apiToken}, Bank configured: ${!!this.config.bankAccount}`,
    );
  }

  /**
   * Check if SePay is properly configured
   */
  private isConfigured(): boolean {
    return !!(
      this.config.apiToken &&
      this.config.bankAccount &&
      this.config.bankName
    );
  }

  /**
   * Generate VietQR payment QR code
   * This replaces the traditional "create payment" - we generate QR codes for bank transfer
   */
  async createPayment(
    request: CreatePaymentRequest,
  ): Promise<SepayPaymentResponse> {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          message:
            'SePay is not configured. Please set bank account information.',
          error: 'SEPAY_NOT_CONFIGURED',
        };
      }

      this.logger.log(
        `Creating VietQR payment for order: ${request.orderCode}`,
      );

      // Create transfer content with order code for SePay to detect
      const transferContent =
        `${request.orderCode} ${request.orderInfo}`.trim();

      // Generate VietQR URL - this is the standard for Vietnamese QR payments
      const qrData = this.generateVietQRData({
        bankAccount: this.config.bankAccount,
        accountHolder: this.config.accountHolder,
        amount: request.amount,
        transferContent: transferContent,
      });

      // VietQR API URL - you can use qr.sepay.vn or api.vietqr.io
      const qrCodeUrl = `https://qr.sepay.vn/img?acc=${this.config.bankAccount}&bank=${this.getBankCode(this.config.bankName)}&amount=${request.amount}&des=${encodeURIComponent(transferContent)}&template=compact`;

      this.logger.log(
        `VietQR generated successfully for order: ${request.orderCode}`,
      );

      return {
        success: true,
        message: 'VietQR payment created successfully',
        data: {
          orderCode: request.orderCode,
          qrCodeUrl: qrCodeUrl,
          qrCodeData: qrData,
          bankInfo: {
            accountNumber: this.config.bankAccount,
            accountHolder: this.config.accountHolder,
            bankName: this.config.bankName,
            amount: request.amount,
            transferContent: transferContent,
          },
          amount: request.amount,
          status: 'PENDING',
        },
      };
    } catch (error) {
      this.logger.error(
        `VietQR generation failed for ${request.orderCode}:`,
        error.message,
      );

      return {
        success: false,
        message: error.message || 'Failed to create payment QR',
        error: error.message,
      };
    }
  }

  /**
   * Generate VietQR data string
   */
  private generateVietQRData(params: {
    bankAccount: string;
    accountHolder: string;
    amount: number;
    transferContent: string;
  }): string {
    // VietQR format: https://vietqr.net/
    // This is a simplified version - you might want to use a proper VietQR library
    const { bankAccount, accountHolder, amount, transferContent } = params;

    return `${bankAccount}|${accountHolder}|${amount}|${transferContent}`;
  }

  /**
   * Get bank code from bank name
   */
  private getBankCode(bankName: string): string {
    const bankCodes: Record<string, string> = {
      Vietcombank: 'VCB',
      Techcombank: 'TCB',
      BIDV: 'BIDV',
      VietinBank: 'VietinBank',
      Agribank: 'AGR',
      'MB Bank': 'MB',
      ACB: 'ACB',
      VPBank: 'VPB',
      TPBank: 'TPB',
      Sacombank: 'STB',
      // Add more banks as needed
    };

    return bankCodes[bankName] || 'VCB'; // Default to Vietcombank
  }

  /**
   * SePay doesn't have a "check payment status" API - status comes through webhooks
   * This method checks our database for payment status
   */
  async checkPaymentStatus(orderCode: string): Promise<{
    success: boolean;
    status: string;
    transactionId?: string;
    amount?: number;
    message?: string;
  }> {
    // Since SePay works via webhooks, we don't check their API
    // Instead, we should check our local database for the payment status
    // This would be implemented in your PaymentService, not here

    this.logger.log(
      `Payment status check for ${orderCode} - this should be handled by PaymentService`,
    );

    return {
      success: true,
      status: 'PENDING', // Default status - real status comes from webhooks
      message:
        'Payment status should be checked from local database, not SePay API',
    };
  }

  /**
   * SePay doesn't support payment cancellation - it's just bank transfers
   */
  async cancelPayment(orderCode: string): Promise<{
    success: boolean;
    message: string;
  }> {
    this.logger.log(
      `Payment cancellation requested for ${orderCode} - not supported by SePay`,
    );

    return {
      success: true,
      message:
        'SePay payments cannot be cancelled - they are bank transfers. Update order status locally.',
    };
  }

  /**
   * Generate QR code using external service
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
      if (!this.isConfigured()) {
        return { success: false, message: 'SePay not configured' };
      }

      const transferContent = `${orderCode}`;
      const qrCodeUrl = `https://qr.sepay.vn/img?acc=${this.config.bankAccount}&bank=${bankCode || this.getBankCode(this.config.bankName)}&amount=${amount}&des=${encodeURIComponent(transferContent)}&template=compact`;

      return {
        success: true,
        qrCodeUrl: qrCodeUrl,
        qrCodeData: this.generateVietQRData({
          bankAccount: this.config.bankAccount,
          accountHolder: this.config.accountHolder,
          amount: amount,
          transferContent: transferContent,
        }),
        message: 'QR code generated successfully',
      };
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
   * Test SePay connection - since there's no API, we just check configuration
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config.apiToken) {
      return {
        success: false,
        message:
          'SePay API token not configured - webhook authentication will fail',
      };
    }

    if (!this.config.bankAccount || !this.config.bankName) {
      return {
        success: false,
        message:
          'SePay bank information not configured - cannot generate QR codes',
      };
    }

    return {
      success: true,
      message: `SePay configured successfully. Bank: ${this.config.bankName}, Account: ${this.config.bankAccount}, Webhook authentication: ${!!this.config.apiToken}`,
    };
  }

  /**
   * Verify webhook signature from SePay
   */
  verifyWebhookSignature(headers: Record<string, string>): boolean {
    try {
      if (!this.config.apiToken) {
        this.logger.warn('No API token configured for webhook verification');
        return false;
      }

      // SePay sends: "Authorization":"Apikey YOUR_API_TOKEN"
      const authHeader = headers.authorization || headers.Authorization;

      if (!authHeader) {
        this.logger.warn('No Authorization header in webhook request');
        return false;
      }

      const expectedAuth = `Apikey ${this.config.apiToken}`;
      const isValid = authHeader === expectedAuth;

      if (!isValid) {
        this.logger.warn('Invalid webhook signature', {
          received: authHeader.substring(0, 20) + '...',
          expected: expectedAuth.substring(0, 20) + '...',
        });
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying webhook signature:', error.message);
      return false;
    }
  }

  /**
   * Process webhook payload from SePay
   */
  processWebhookPayload(payload: SepayWebhookPayload): {
    success: boolean;
    orderCode?: string;
    amount?: number;
    transactionId?: string;
    message: string;
  } {
    try {
      this.logger.log(
        `Processing SePay webhook for transaction ID: ${payload.id}`,
      );

      // Validate webhook payload
      if (
        !payload.id ||
        !payload.transferAmount ||
        payload.transferType !== 'in'
      ) {
        return {
          success: false,
          message:
            'Invalid webhook payload - missing required fields or not an incoming transaction',
        };
      }

      // Extract order code from payment content
      // SePay auto-detects the code based on your configuration
      const orderCode =
        payload.code || this.extractOrderCodeFromContent(payload.content);

      if (!orderCode) {
        return {
          success: false,
          message: 'No order code found in transaction content',
        };
      }

      return {
        success: true,
        orderCode: orderCode,
        amount: payload.transferAmount,
        transactionId: payload.id.toString(),
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      this.logger.error('Error processing webhook payload:', error.message);
      return {
        success: false,
        message: `Webhook processing failed: ${error.message}`,
      };
    }
  }

  /**
   * Extract order code from transfer content
   */
  private extractOrderCodeFromContent(content: string): string | null {
    try {
      // Try to extract order code from content
      // Assuming order codes start with "DT" followed by numbers and letters
      const match = content.match(/DT\w+/i);
      return match ? match[0] : null;
    } catch (error) {
      this.logger.error('Error extracting order code:', error.message);
      return null;
    }
  }

  /**
   * Get configuration status
   */
  getConfigStatus(): {
    configured: boolean;
    bankAccount: string;
    bankName: string;
    webhookUrl: string;
    apiTokenSet: boolean;
  } {
    return {
      configured: this.isConfigured(),
      bankAccount: this.config.bankAccount || 'NOT SET',
      bankName: this.config.bankName || 'NOT SET',
      webhookUrl: this.config.webhookUrl || 'NOT SET',
      apiTokenSet: !!this.config.apiToken,
    };
  }

  /**
   * Get payment methods - for SePay it's just bank transfer
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
    const methods = [
      {
        code: 'sepay_bank',
        name: `Chuyển khoản ${this.config.bankName}`,
        type: 'bank_transfer',
        enabled: this.isConfigured(),
      },
    ];

    return {
      success: true,
      methods,
      message: 'SePay payment methods retrieved successfully',
    };
  }
}
