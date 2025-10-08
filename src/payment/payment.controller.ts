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
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { SepayService } from './sepay.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/public.decorator';

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

  @Get('order-details/:orderId')
  async getOrderDetails(@Param('orderId') orderId: string) {
    try {
      return await this.paymentService.getOrderDetails(orderId);
    } catch (error) {
      this.logger.error(`Get order details failed for ${orderId}:`, error);
      return {
        success: false,
        message: error.message || 'Failed to get order details',
      };
    }
  }

  @Public()
  @Post('webhook/sepay')
  @HttpCode(HttpStatus.OK)
  async handleSepayWebhook(@Body() webhookData: any, @Req() req: any) {
    try {
      const result = await this.paymentService.handleWebhook(webhookData);
      return { success: true };
    } catch (error) {
      this.logger.error('Webhook error:', error.stack);
      return { success: true, error: 'processed_with_error' };
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

  @Post('create-cod-order')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createCODOrder(@Body() createPaymentDto: CreatePaymentDto) {
    try {
      if (!createPaymentDto.amounts) {
        throw new BadRequestException('Missing amounts data');
      }
      return await this.paymentService.createCODOrder(createPaymentDto);
    } catch (error) {
      this.logger.error('COD order creation failed:', error);
      throw new BadRequestException(
        `Failed to create COD order: ${error.message}`,
      );
    }
  }
}
