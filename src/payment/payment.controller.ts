import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { SepayService } from './sepay.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ConfigService } from '@nestjs/config';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private paymentService: PaymentService,
    private sepayService: SepayService,
    private configService: ConfigService,
  ) {}

  @Post('create')
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    try {
      return await this.paymentService.createOrder(createPaymentDto);
    } catch (error) {
      this.logger.error('Payment creation failed:', error);
      return {
        success: false,
        message: error.message || 'Failed to create payment',
      };
    }
  }

  @Get('status/:orderId')
  async getPaymentStatus(@Param('orderId') orderId: string) {
    try {
      return await this.paymentService.checkPaymentStatus(orderId);
    } catch (error) {
      this.logger.error(`Payment status check failed for ${orderId}:`, error);
      return {
        success: false,
        message: error.message || 'Failed to check payment status',
      };
    }
  }

  @Post('webhook/sepay')
  @HttpCode(HttpStatus.OK)
  async handleSepayWebhook(@Body() webhookData: any, @Req() req: any) {
    this.logger.log('🚨 SEPAY WEBHOOK CALLED 🚨');
    this.logger.log('Timestamp:', new Date().toISOString());
    this.logger.log('IP:', req.ip || req.connection.remoteAddress);
    this.logger.log('User-Agent:', req.headers['user-agent']);
    this.logger.log('Method:', req.method);
    this.logger.log('URL:', req.url);
    this.logger.log('Headers:', JSON.stringify(req.headers, null, 2));
    this.logger.log('Body:', JSON.stringify(webhookData, null, 2));

    try {
      const result = await this.paymentService.handleWebhook(webhookData);
      this.logger.log('✅ Webhook processed:', result);
      return { success: true, received: true, result };
    } catch (error) {
      this.logger.error('❌ Webhook error:', error.stack);
      return { success: false, received: true, error: error.message };
    }
  }

  @Get('test-connection')
  async testConnection() {
    const result = await this.sepayService.testConnection();
    this.logger.log('Test connection result:', result);
    return result;
  }

  @Get('validate-token')
  async validateToken() {
    const isValid = await this.sepayService.validateApiToken();
    return {
      success: isValid,
      message: isValid ? 'API token is valid' : 'API token is invalid',
    };
  }

  @Get('debug-config')
  async debugConfig() {
    return {
      baseUrl: this.configService.get('SEPAY_BASE_URL'),
      bankAccount: this.configService.get('SEPAY_BANK_ACCOUNT'),
      bankName: this.configService.get('SEPAY_BANK_NAME'),
      hasApiToken: !!this.configService.get('SEPAY_API_TOKEN'),
      tokenLength: this.configService.get('SEPAY_API_TOKEN')?.length || 0,
    };
  }

  @Get('methods')
  async getPaymentMethods() {
    return {
      success: true,
      methods: [
        {
          code: 'sepay_bank',
          name: 'Chuyển khoản ngân hàng',
          enabled: true,
        },
        {
          code: 'cod',
          name: 'Thanh toán khi nhận hàng',
          enabled: true,
        },
      ],
    };
  }

  @Get('debug/:orderId')
  async debugOrder(@Param('orderId') orderId: string) {
    try {
      const order = await this.paymentService.getOrderDebugInfo(orderId);
      return { success: true, data: order };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post('webhook/test')
  @HttpCode(HttpStatus.OK)
  async testWebhook(@Body() testData: any) {
    this.logger.log('Manual webhook test:', testData);

    const sampleData = {
      content: 'DH123456',
      transferAmount: 100000,
      transferType: 'in',
      id: 'TEST_TXN_123',
    };

    return await this.paymentService.handleWebhook(testData || sampleData);
  }

  @Get('webhook/health')
  async webhookHealth() {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      webhook_url: 'https://api.gaulermao.com/api/payment/webhook/sepay',
    };
  }

  @Get('webhook/sepay/test')
  async testWebhookEndpoint() {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      message: 'SePay webhook endpoint is accessible',
      url: this.configService.get('SEPAY_WEBHOOK_URL'),
    };
  }

  @Post('webhook/test-manual')
  @HttpCode(HttpStatus.OK)
  async testManualWebhook(@Body() testData: any) {
    const sampleData = {
      gateway: 'VietinBank',
      transactionDate: '2024-01-01 12:00:00',
      accountNumber: '108877212192',
      subAccount: '',
      transferType: 'in',
      transferAmount: 100000,
      accumulated: 500000,
      code: 'TEST123',
      content: 'DH123456',
      referenceCode: 'REF123',
      description: 'Test payment DH123456',
    };

    return await this.paymentService.handleWebhook(testData || sampleData);
  }

  @Post('webhook/sepay/manual-test')
  @HttpCode(HttpStatus.OK)
  async manualTestWebhook(@Body() testData?: any) {
    const sampleWebhookData = {
      gateway: 'VietinBank',
      transactionDate: '2025-09-23 14:30:00',
      accountNumber: '108877212192',
      subAccount: '',
      transferType: 'in',
      transferAmount: 100000,
      accumulated: 500000,
      code: 'TXN123456',
      content: 'DH1 Thanh toan don hang',
      referenceCode: 'REF123456',
      description: 'Thanh toan don hang DH1',
    };

    this.logger.log('=== MANUAL WEBHOOK TEST ===');
    this.logger.log('Test data:', testData || sampleWebhookData);

    const result = await this.paymentService.handleWebhook(
      testData || sampleWebhookData,
    );

    return {
      testResult: result,
      testData: testData || sampleWebhookData,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('order/:orderId/debug')
  async debugOrderInfo(@Param('orderId') orderId: string) {
    try {
      const debugInfo = await this.paymentService.getOrderDebugInfo(orderId);
      return { success: true, data: debugInfo };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
