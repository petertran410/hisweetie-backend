// src/payment/sepay.service.ts - FIXED VERSION for SePay Integration
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
    qrCodeUrl: string;
    qrCodeData: string;
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

// SePay webhook payload structure (from documentation)
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

    if (!webhookUrl) {
      this.logger.warn(
        'SEPAY_WEBHOOK_URL is not configured. Please set this to your webhook endpoint.',
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
      `SePay service initialized. API Token: ${!!this.config.apiToken}, Bank: ${this.config.bankName} (${this.config.bankAccount}), Webhook: ${this.config.webhookUrl}`,
    );
  }

  /**
   * Check if SePay is properly configured
   */
  private isConfigured(): boolean {
    return !!(
      this.config.apiToken &&
      this.config.bankAccount &&
      this.config.bankName &&
      this.config.accountHolder
    );
  }

  /**
   * Generate VietQR payment QR code with proper SePay format
   */
  async createPayment(
    request: CreatePaymentRequest,
  ): Promise<SepayPaymentResponse> {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          message:
            'SePay is not configured. Please check environment variables.',
          error: 'SEPAY_NOT_CONFIGURED',
        };
      }

      this.logger.log(
        `Creating VietQR payment for order: ${request.orderCode}`,
      );

      // CRITICAL: Create transfer content that SePay can detect
      // Format: {ORDER_CODE} {OPTIONAL_DESCRIPTION}
      const transferContent =
        `${request.orderCode} ${request.orderInfo}`.trim();

      this.logger.log(`Transfer content: "${transferContent}"`);

      // Generate VietQR URL with proper format
      // Using official VietQR format that works with SePay
      const bankCode = this.getBankCode(this.config.bankName);
      const qrCodeUrl = `https://img.vietqr.io/image/${bankCode}-${this.config.bankAccount}-${encodeURIComponent('compact')}.png?amount=${request.amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(this.config.accountHolder)}`;

      // Alternative QR URL (SePay's own service)
      const sepayQrUrl = `https://qr.sepay.vn/img?acc=${this.config.bankAccount}&bank=${bankCode}&amount=${request.amount}&des=${encodeURIComponent(transferContent)}&template=compact`;

      // Generate QR data for manual processing
      const qrData = this.generateVietQRData({
        bankAccount: this.config.bankAccount,
        accountHolder: this.config.accountHolder,
        amount: request.amount,
        transferContent: transferContent,
      });

      this.logger.log(
        `VietQR generated successfully for order: ${request.orderCode}`,
      );
      this.logger.log(`QR URLs: VietQR=${qrCodeUrl}, SePay=${sepayQrUrl}`);

      return {
        success: true,
        message: 'VietQR payment created successfully',
        data: {
          orderCode: request.orderCode,
          qrCodeUrl: qrCodeUrl, // Use VietQR by default
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
    const { bankAccount, accountHolder, amount, transferContent } = params;
    return `Bank: ${this.config.bankName}\nAccount: ${bankAccount}\nHolder: ${accountHolder}\nAmount: ${amount}\nContent: ${transferContent}`;
  }

  /**
   * Get bank code from bank name (updated with more banks)
   */
  private getBankCode(bankName: string): string {
    const bankCodes: Record<string, string> = {
      Vietcombank: 'VCB',
      Techcombank: 'TCB',
      BIDV: 'BIDV',
      VietinBank: 'VietinBank',
      Agribank: 'AGR',
      'MB Bank': 'MB',
      MBBank: 'MB',
      ACB: 'ACB',
      VPBank: 'VPB',
      TPBank: 'TPB',
      Sacombank: 'STB',
      VIB: 'VIB',
      SHB: 'SHB',
      Eximbank: 'EIB',
      OCB: 'OCB',
      MSB: 'MSB',
      HDBank: 'HDB',
      VietCapitalBank: 'BVB',
      SCB: 'SCB',
      VietABank: 'VAB',
      NamABank: 'NAB',
      PGBank: 'PGB',
      VietBank: 'VBB',
      NCB: 'NCB',
      SGB: 'SGB',
      BacABank: 'BAB',
      GPBank: 'GPB',
      OceanBank: 'OCN',
      CBBank: 'CBB',
      SeABank: 'SSB',
      CAKE: 'CAKE',
      Ubank: 'UBB',
      Timo: 'TIMO',
      VRB: 'VRB',
      WooriBankVN: 'WVN',
      KookminBankVN: 'KBHN',
      KEBHanaVN: 'KEBHANA',
      MAFC: 'MAFC',
      CitiBank: 'CITI',
      KienLongBank: 'KLB',
      StandardCharteredVN: 'SC',
      PublicBank: 'PBVN',
      HSBC: 'HSBC',
      DBSBank: 'DBS',
      HongLeongVN: 'HLBVN',
      UOB: 'UOB',
      Shinhan: 'SVB',
      ABBANK: 'ABB',
      SaigonBank: 'SGB',
      BaoVietBank: 'BVB',
      LienVietPostBank: 'LPB',
    };

    const code =
      bankCodes[bankName] || bankCodes[bankName.replace(/\s+/g, '')] || 'VCB';
    this.logger.debug(`Bank name "${bankName}" mapped to code: ${code}`);
    return code;
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

      this.logger.log(
        `Webhook signature verification: ${isValid ? 'VALID' : 'INVALID'}`,
      );

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
      this.logger.log(`Transaction details:`, {
        id: payload.id,
        gateway: payload.gateway,
        transferType: payload.transferType,
        amount: payload.transferAmount,
        content: payload.content,
        code: payload.code,
        accountNumber: payload.accountNumber,
      });

      // Validate webhook payload
      if (
        !payload.id ||
        !payload.transferAmount ||
        payload.transferType !== 'in'
      ) {
        const message =
          'Invalid webhook payload - missing required fields or not an incoming transaction';
        this.logger.warn(message, payload);
        return {
          success: false,
          message,
        };
      }

      // Verify this is our bank account
      if (payload.accountNumber !== this.config.bankAccount) {
        const message = `Transaction is for different account: ${payload.accountNumber} (expected: ${this.config.bankAccount})`;
        this.logger.warn(message);
        return {
          success: false,
          message,
        };
      }

      // Extract order code from payment content
      // SePay may auto-detect the code and put it in the 'code' field
      // OR we need to extract it from the 'content' field
      let orderCode = payload.code;

      if (!orderCode) {
        orderCode = this.extractOrderCodeFromContent(payload.content);
      }

      if (!orderCode) {
        const message = `No order code found in transaction. Content: "${payload.content}", Code: "${payload.code}"`;
        this.logger.warn(message);
        return {
          success: false,
          message,
        };
      }

      this.logger.log(
        `Successfully extracted order code: ${orderCode} from transaction ${payload.id}`,
      );

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
   * Improved extraction with multiple patterns
   */
  private extractOrderCodeFromContent(content: string): string | null {
    try {
      this.logger.log(`Extracting order code from content: "${content}"`);

      // Try multiple patterns to extract order code
      const patterns = [
        /DT\d{8}[A-Z0-9]{6}/i, // Pattern: DT12345678ABC123 (your current format)
        /DT\w+/i, // Pattern: DT followed by word characters
        /\bDT\d+\b/i, // Pattern: DT followed by digits
        /\b[A-Z]{2}\d{8}[A-Z0-9]+\b/i, // Pattern: 2 letters + 8 digits + alphanumeric
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          this.logger.log(
            `Order code extracted using pattern ${pattern}: ${match[0]}`,
          );
          return match[0];
        }
      }

      // If no pattern matches, try to find any word that starts with DT
      const words = content.split(/\s+/);
      for (const word of words) {
        if (word.toUpperCase().startsWith('DT') && word.length > 3) {
          this.logger.log(`Order code extracted from words: ${word}`);
          return word;
        }
      }

      this.logger.warn(`No order code pattern found in content: "${content}"`);
      return null;
    } catch (error) {
      this.logger.error('Error extracting order code:', error.message);
      return null;
    }
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
      const finalBankCode = bankCode || this.getBankCode(this.config.bankName);

      // Use VietQR service for better compatibility
      const qrCodeUrl = `https://img.vietqr.io/image/${finalBankCode}-${this.config.bankAccount}-${encodeURIComponent('compact')}.png?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(this.config.accountHolder)}`;

      const qrCodeData = this.generateVietQRData({
        bankAccount: this.config.bankAccount,
        accountHolder: this.config.accountHolder,
        amount: amount,
        transferContent: transferContent,
      });

      this.logger.log(`Generated QR code for order ${orderCode}: ${qrCodeUrl}`);

      return {
        success: true,
        qrCodeUrl: qrCodeUrl,
        qrCodeData: qrCodeData,
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
   * Test SePay connection and configuration
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const issues: string[] = [];

    if (!this.config.apiToken) {
      issues.push('API token not configured');
    }

    if (!this.config.bankAccount) {
      issues.push('Bank account not configured');
    }

    if (!this.config.bankName) {
      issues.push('Bank name not configured');
    }

    if (!this.config.accountHolder) {
      issues.push('Account holder not configured');
    }

    if (!this.config.webhookUrl) {
      issues.push('Webhook URL not configured');
    }

    if (issues.length > 0) {
      return {
        success: false,
        message: `SePay configuration issues: ${issues.join(', ')}. Please check your environment variables.`,
      };
    }

    return {
      success: true,
      message: `SePay configured successfully. Bank: ${this.config.bankName} (${this.config.bankAccount}), Webhook: ${this.config.webhookUrl}`,
    };
  }

  /**
   * Get configuration status for debugging
   */
  getConfigStatus(): {
    configured: boolean;
    bankAccount: string;
    bankName: string;
    webhookUrl: string;
    apiTokenSet: boolean;
    bankCode: string;
  } {
    return {
      configured: this.isConfigured(),
      bankAccount: this.config.bankAccount || 'NOT SET',
      bankName: this.config.bankName || 'NOT SET',
      webhookUrl: this.config.webhookUrl || 'NOT SET',
      apiTokenSet: !!this.config.apiToken,
      bankCode: this.getBankCode(this.config.bankName),
    };
  }

  /**
   * Get payment methods with proper configuration check
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
    const isConfigured = this.isConfigured();

    const methods = [
      {
        code: 'sepay_bank',
        name: isConfigured
          ? `Chuyển khoản ${this.config.bankName}`
          : 'Chuyển khoản ngân hàng (Chưa cấu hình)',
        type: 'bank_transfer',
        enabled: isConfigured,
      },
    ];

    return {
      success: true,
      methods,
      message: isConfigured
        ? 'SePay payment methods retrieved successfully'
        : 'SePay not configured - please check environment variables',
    };
  }
}
