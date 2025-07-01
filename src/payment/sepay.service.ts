// src/payment/sepay.service.ts - ENHANCED VERSION
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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

  // constructor(private readonly configService: ConfigService) {
  //   // Get SePay configuration
  //   const apiToken = this.configService.get('SEPAY_API_TOKEN') as string;
  //   const bankAccount = this.configService.get('SEPAY_BANK_ACCOUNT') as string;
  //   const bankName = this.configService.get('SEPAY_BANK_NAME') as string;
  //   const accountHolder = this.configService.get(
  //     'SEPAY_ACCOUNT_HOLDER',
  //   ) as string;
  //   const webhookUrl = this.configService.get('SEPAY_WEBHOOK_URL') as string;

  //   if (!apiToken) {
  //     this.logger.warn(
  //       'SEPAY_API_TOKEN is not configured. SePay webhook authentication will fail.',
  //     );
  //   }

  //   if (!bankAccount || !bankName || !accountHolder) {
  //     this.logger.warn(
  //       'SePay bank information is incomplete. Payment QR codes cannot be generated.',
  //     );
  //   }

  //   if (!webhookUrl) {
  //     this.logger.warn(
  //       'SEPAY_WEBHOOK_URL is not configured. Please set this to your webhook endpoint.',
  //     );
  //   }

  //   this.config = {
  //     apiToken: apiToken || '',
  //     bankAccount: bankAccount || '',
  //     bankName: bankName || '',
  //     accountHolder: accountHolder || '',
  //     webhookUrl: webhookUrl || '',
  //   };

  //   this.logger.log(
  //     `SePay service initialized. API Token: ${!!this.config.apiToken}, Bank: ${this.config.bankName} (${this.config.bankAccount}), Webhook: ${this.config.webhookUrl}`,
  //   );

  //   // Register webhook with SePay if configured
  //   if (this.config.apiToken && this.config.webhookUrl) {
  //     this.registerWebhook();
  //   }
  // }

  /**
   * Register webhook with SePay
   */
  // private async registerWebhook(): Promise<void> {
  //   try {
  //     this.logger.log('Registering webhook with SePay...');

  //     const response = await axios.post(
  //       'https://my.sepay.vn/userapi/webhooks/register',
  //       {
  //         url: this.config.webhookUrl,
  //         secret: this.config.apiToken,
  //       },
  //       {
  //         headers: {
  //           Authorization: `Bearer ${this.config.apiToken}`,
  //           'Content-Type': 'application/json',
  //         },
  //       },
  //     );

  //     this.logger.log('Webhook registration response:', response.data);
  //   } catch (error) {
  //     this.logger.error('Failed to register webhook:', error.message);
  //   }
  // }

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
   * FIXED: Generate payment QR code with improved format
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

      // ENHANCED: Use only order code to avoid user modifications
      // This makes it easier for SePay to detect the payment
      const transferContent = request.orderCode;

      this.logger.log(`Transfer content: "${transferContent}"`);

      // FIXED: Use SePay's QR service
      const bankCode = this.getBankCode(this.config.bankName);

      // Use SePay's QR service with simplified content
      const sepayQrUrl = `https://qr.sepay.vn/img?acc=${this.config.bankAccount}&bank=${bankCode}&amount=${request.amount}&des=${encodeURIComponent(transferContent)}&template=compact`;

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
      this.logger.log(`QR URL: ${sepayQrUrl}`);

      return {
        success: true,
        message: 'SePay payment created successfully',
        data: {
          orderCode: request.orderCode,
          qrCodeUrl: sepayQrUrl,
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
      this.logger.error('Failed to create payment:', error.message);
      return {
        success: false,
        message: error.message || 'Failed to create payment',
        error: error.message,
      };
    }
  }

  /**
   * Generate payment info string
   */
  private generatePaymentInfo(data: {
    bankAccount: string;
    accountHolder: string;
    amount: number;
    transferContent: string;
  }): string {
    return JSON.stringify({
      bank: this.config.bankName,
      account: data.bankAccount,
      holder: data.accountHolder,
      amount: data.amount,
      content: data.transferContent,
    });
  }

  /**
   * Get bank code for QR generation
   */
  private getBankCode(bankName: string): string {
    const bankCodes: Record<string, string> = {
      Vietcombank: 'VCB',
      VietinBank: 'CTG',
      'VietinBank ': 'CTG',
      Techcombank: 'TCB',
      BIDV: 'BIDV',
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
   * ENHANCED: Process webhook payload with flexible pattern matching
   */
  processWebhookPayload(payload: SepayWebhookPayload): {
    success: boolean;
    orderCode?: string;
    amount?: number;
    transactionId?: string;
    message: string;
  } {
    try {
      this.logger.log('📦 Processing SePay webhook payload:', {
        id: payload.id,
        gateway: payload.gateway,
        transferType: payload.transferType,
        amount: payload.transferAmount,
        content: payload.content,
        code: payload.code,
        accountNumber: payload.accountNumber,
        transactionDate: payload.transactionDate,
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

      // ENHANCED: Try multiple methods to extract order code
      let orderCode: string | null = null;

      // Method 1: Use SePay auto-detected code
      if (payload.code) {
        orderCode = payload.code;
        this.logger.log(`📌 Using SePay auto-detected code: ${orderCode}`);
      }

      // Method 2: Extract from content with flexible patterns
      if (!orderCode && payload.content) {
        orderCode = this.extractOrderCodeFromContent(payload.content);
        if (orderCode) {
          this.logger.log(`📌 Extracted order code from content: ${orderCode}`);
        }
      }

      // Method 3: Try description field as fallback
      if (!orderCode && payload.description) {
        orderCode = this.extractOrderCodeFromContent(payload.description);
        if (orderCode) {
          this.logger.log(
            `📌 Extracted order code from description: ${orderCode}`,
          );
        }
      }

      if (!orderCode) {
        const message = `No order code found in transaction. Content: "${payload.content}", Code: "${payload.code}", Description: "${payload.description}"`;
        this.logger.error('❌ ' + message);
        return { success: false, message };
      }

      this.logger.log(
        `✅ Successfully processed webhook for order: ${orderCode}`,
      );

      return {
        success: true,
        orderCode: orderCode,
        amount: payload.transferAmount,
        transactionId: payload.id.toString(),
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      this.logger.error('❌ Error processing webhook payload:', error.message);
      return {
        success: false,
        message: `Webhook processing failed: ${error.message}`,
      };
    }
  }

  /**
   * ENHANCED: Extract order code with comprehensive pattern matching
   */
  private extractOrderCodeFromContent(content: string): string | null {
    try {
      this.logger.log(`🔍 Extracting order code from content: "${content}"`);

      // ENHANCED: More flexible patterns to handle various user input formats
      const patterns = [
        // Pattern 1: Just the order code format (most flexible)
        /(DT\d{8}[A-Z0-9]{6})/i,

        // Pattern 2: SEVQR prefix anywhere with order code
        /SEVQR\s*(DT\d{8}[A-Z0-9]{6})/i,

        // Pattern 3: Order code after phone numbers
        /\d+-\d+-.*?(DT\d{8}[A-Z0-9]{6})/i,

        // Pattern 4: Order code with any prefix
        /[\w\s-]*(DT\d{8}[A-Z0-9]{6})/i,

        // Pattern 5: Look for DT followed by numbers and letters
        /(DT[\dA-Z]{14})/i,

        // Pattern 6: More general pattern for order codes
        /\b(DT\w{14})\b/i,
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const extractedCode = match[1].toUpperCase();
          this.logger.log(
            `✅ Order code found with pattern ${pattern}: ${extractedCode}`,
          );
          return extractedCode;
        }
      }

      // Additional check: if content contains DT, try to extract it
      if (content.includes('DT')) {
        const dtIndex = content.indexOf('DT');
        const possibleCode = content.substring(dtIndex, dtIndex + 16);
        if (/^DT[\dA-Z]{14}$/i.test(possibleCode)) {
          this.logger.log(`✅ Order code found by DT search: ${possibleCode}`);
          return possibleCode.toUpperCase();
        }
      }

      this.logger.warn(`❌ No order code found in content: "${content}"`);
      return null;
    } catch (error) {
      this.logger.error('Error extracting order code:', error.message);
      return null;
    }
  }

  /**
   * Manual transaction check via SePay API
   */
  async checkTransactionStatus(orderCode: string): Promise<any> {
    try {
      if (!this.config.apiToken) {
        throw new Error('SePay API token not configured');
      }

      this.logger.log(`Checking transaction status for order: ${orderCode}`);

      const response = await axios.get(
        `https://my.sepay.vn/userapi/transactions/search?keyword=${orderCode}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
          },
        },
      );

      this.logger.log('Transaction search response:', response.data);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to check transaction status:', error.message);
      throw error;
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

      // Use only order code for simpler detection
      const transferContent = orderCode;
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

    // Test API connection
    try {
      await this.checkTransactionStatus('TEST');
      return {
        success: true,
        message: `SePay configured and connected successfully. Bank: ${this.config.bankName} (${this.config.bankAccount}), Webhook: ${this.config.webhookUrl}`,
      };
    } catch (error) {
      return {
        success: true,
        message: `SePay configured. Bank: ${this.config.bankName} (${this.config.bankAccount}), Webhook: ${this.config.webhookUrl}. API connection test failed but configuration is valid.`,
      };
    }
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
