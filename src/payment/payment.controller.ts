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
    this.logger.log('=== SEPAY WEBHOOK RECEIVED ===');
    this.logger.log('Method:', req.method);
    this.logger.log('URL:', req.url);
    this.logger.log('Headers:', JSON.stringify(req.headers, null, 2));
    this.logger.log('Content-Type:', req.headers['content-type']);
    this.logger.log('Body (parsed):', JSON.stringify(webhookData, null, 2));
    this.logger.log('Raw Body:', req.rawBody || 'No raw body available');
    this.logger.log('================================');

    try {
      this.logger.log('Starting webhook processing...');

      const result = await this.paymentService.handleWebhook(webhookData);

      this.logger.log(
        'Webhook processing result:',
        JSON.stringify(result, null, 2),
      );

      return {
        success: true,
        message: 'Webhook received successfully',
        result,
      };
    } catch (error) {
      this.logger.error('Webhook processing failed:', error.stack);
      return { success: false, message: error.message, error: error.stack };
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
}
