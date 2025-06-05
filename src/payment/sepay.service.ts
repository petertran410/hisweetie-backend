// src/payment/sepay.service.ts - FIXED VERSION with proper SePay QR integration
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
   * FIXED: Generate payment QR code using SePay's service (preferred)
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

      this.logger.log(`Creating SePay payment for order: ${request.orderCode}`);

      // CRITICAL: Format transfer content for SePay detection
      // SePay detects payment codes better when they're at the beginning
      const transferContent = request.orderCode; // Just the order code, clean and simple

      this.logger.log(`Transfer content: "${transferContent}"`);

      // FIXED: Use SePay's QR service instead of VietQR.io
      const bankCode = this.getBankCode(this.config.bankName);

      // PRIMARY: SePay's own QR service (RECOMMENDED)
      const sepayQrUrl = `https://qr.sepay.vn/img?acc=${this.config.bankAccount}&bank=${bankCode}&amount=${request.amount}&des=${encodeURIComponent(transferContent)}&template=compact`;

      // BACKUP: VietQR service (for compatibility)
      const vietqrUrl = `https://img.vietqr.io/image/${bankCode}-${this.config.bankAccount}-compact.png?amount=${request.amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(this.config.accountHolder)}`;

      // Generate QR data for manual processing
      const qrData = this.generatePaymentInfo({
        bankAccount: this.config.bankAccount,
        accountHolder: this.config.accountHolder,
        amount: request.amount,
        transferContent: transferContent,
      });

      this.logger.log(
        `SePay QR generated successfully for order: ${request.orderCode}`,
      );
      this.logger.log(`Primary QR URL (SePay): ${sepayQrUrl}`);
      this.logger.log(`Backup QR URL (VietQR): ${vietqrUrl}`);

      return {
        success: true,
        message: 'SePay payment created successfully',
        data: {
          orderCode: request.orderCode,
          qrCodeUrl: sepayQrUrl, // Use SePay's service as primary
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
        `SePay payment creation failed for ${request.orderCode}:`,
        error.message,
      );

      return {
        success: false,
        message: error.message || 'Failed to create SePay payment',
        error: error.message,
      };
    }
  }

  /**
   * Generate payment information text
   */
  private generatePaymentInfo(params: {
    bankAccount: string;
    accountHolder: string;
    amount: number;
    transferContent: string;
  }): string {
    const { bankAccount, accountHolder, amount, transferContent } = params;
    return `Bank: ${this.config.bankName}\nAccount: ${bankAccount}\nHolder: ${accountHolder}\nAmount: ${amount.toLocaleString('vi-VN')} VND\nContent: ${transferContent}`;
  }

  /**
   * UPDATED: Get bank code from bank name (SePay format)
   */
  private getBankCode(bankName: string): string {
    // SePay bank code mapping (updated for SePay compatibility)
    const bankCodes: Record<string, string> = {
      // Major Vietnamese banks (SePay format)
      Vietcombank: 'VCB',
      Techcombank: 'TCB',
      BIDV: 'BIDV',
      VietinBank: 'VietinBank',
      Agribank: 'AGR',
      'MB Bank': 'MBBank',
      MBBank: 'MBBank',
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
    };

    const code =
      bankCodes[bankName] || bankCodes[bankName.replace(/\s+/g, '')] || 'VCB';
    this.logger.debug(`Bank name "${bankName}" mapped to SePay code: ${code}`);
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
   * ENHANCED: Process webhook payload from SePay with better detection
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
        return { success: false, message };
      }

      // Verify this is our bank account
      if (payload.accountNumber !== this.config.bankAccount) {
        const message = `Transaction is for different account: ${payload.accountNumber} (expected: ${this.config.bankAccount})`;
        this.logger.warn(message);
        return { success: false, message };
      }

      // ENHANCED: Extract order code with multiple methods
      let orderCode = payload.code; // SePay auto-detected code

      if (!orderCode) {
        // Fallback: extract from content
        orderCode = this.extractOrderCodeFromContent(payload.content);
      }

      if (!orderCode) {
        const message = `No order code found in transaction. Content: "${payload.content}", Code: "${payload.code}"`;
        this.logger.warn(message);
        return { success: false, message };
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
   * ENHANCED: Extract order code from transfer content with better patterns
   */
  private extractOrderCodeFromContent(content: string): string | null {
    try {
      this.logger.log(`Extracting order code from content: "${content}"`);

      // Enhanced patterns for SePay order code detection
      const patterns = [
        /DT\d{8}[A-Z0-9]{6}/i, // DT12345678ABC123 (your format)
        /DT[A-Z0-9]{14}/i, // DT + 14 alphanumeric
        /DT\d{8}[A-Z]{6}/i, // DT + 8 digits + 6 letters
        /\bDT\w{8,}\b/i, // DT followed by 8+ word characters
        /^DT\w+/i, // DT at start of content
        /\bDT\d+\b/i, // DT followed by digits
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          const extracted = match[0].toUpperCase();
          this.logger.log(
            `Order code extracted using pattern ${pattern}: ${extracted}`,
          );
          return extracted;
        }
      }

      // Final fallback: look for any word starting with DT
      const words = content.split(/\s+/);
      for (const word of words) {
        if (word.toUpperCase().startsWith('DT') && word.length > 3) {
          const extracted = word.toUpperCase();
          this.logger.log(`Order code extracted from words: ${extracted}`);
          return extracted;
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
   * Generate QR code (using SePay service)
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

      const transferContent = orderCode; // Clean order code only
      const finalBankCode = bankCode || this.getBankCode(this.config.bankName);

      // Use SePay QR service
      const qrCodeUrl = `https://qr.sepay.vn/img?acc=${this.config.bankAccount}&bank=${finalBankCode}&amount=${amount}&des=${encodeURIComponent(transferContent)}&template=compact`;

      const qrCodeData = this.generatePaymentInfo({
        bankAccount: this.config.bankAccount,
        accountHolder: this.config.accountHolder,
        amount: amount,
        transferContent: transferContent,
      });

      this.logger.log(
        `Generated SePay QR code for order ${orderCode}: ${qrCodeUrl}`,
      );

      return {
        success: true,
        qrCodeUrl: qrCodeUrl,
        qrCodeData: qrCodeData,
        message: 'QR code generated successfully using SePay service',
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
