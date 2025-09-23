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

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private paymentService: PaymentService,
    private sepayService: SepayService,
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
    this.logger.log('Received SePay webhook:', webhookData);
    try {
      return await this.paymentService.handleWebhook(webhookData);
    } catch (error) {
      this.logger.error('Webhook processing failed:', error);
      return { success: false, message: error.message };
    }
  }

  @Get('test-connection')
  async testConnection() {
    return this.sepayService.testConnection();
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
}
