// src/payment/payment.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
  BadRequestException,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { SepayService } from './sepay.service';
import { CreatePaymentDto, SepayWebhookDto } from './dto/create-payment.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly sepayService: SepayService,
  ) {}

  @Post('create')
  @ApiOperation({
    summary: 'Create payment order',
    description: 'Creates a new payment order with SePay integration',
  })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({
    status: 201,
    description: 'Payment order created successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        orderId: { type: 'string' },
        paymentUrl: { type: 'string', nullable: true },
        qrCodeUrl: { type: 'string', nullable: true },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation failed or payment creation failed',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    try {
      this.logger.log('Creating new payment order');
      this.logger.debug('Payment request data:', {
        customerName: createPaymentDto.customerInfo.fullName,
        itemCount: createPaymentDto.cartItems.length,
        total: createPaymentDto.amounts.total,
        paymentMethod: createPaymentDto.paymentMethod,
      });

      const result = await this.paymentService.createPayment(createPaymentDto);

      this.logger.log(`Payment order created: ${result.orderId}`);
      return result;
    } catch (error) {
      this.logger.error('Failed to create payment order:', error.message);
      throw new BadRequestException(
        `Payment creation failed: ${error.message}`,
      );
    }
  }

  @Get('status/:orderId')
  @ApiOperation({
    summary: 'Get payment status',
    description: 'Retrieves the current status of a payment order',
  })
  @ApiParam({
    name: 'orderId',
    description: 'Order ID',
    example: '123456789',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: {
          type: 'string',
          enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'],
        },
        orderId: { type: 'string' },
        amount: { type: 'number' },
        paymentMethod: { type: 'string' },
        transactionId: { type: 'string', nullable: true },
        message: { type: 'string' },
      },
    },
  })
  async getPaymentStatus(@Param('orderId') orderId: string) {
    try {
      this.logger.log(`Getting payment status for order: ${orderId}`);

      const result = await this.paymentService.getPaymentStatus(orderId);

      this.logger.log(`Payment status for ${orderId}: ${result.status}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get payment status for ${orderId}:`,
        error.message,
      );
      throw new BadRequestException(
        `Failed to get payment status: ${error.message}`,
      );
    }
  }

  @Get('methods')
  @ApiOperation({
    summary: 'Get payment methods',
    description: 'Retrieves available payment methods',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment methods retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        methods: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              name: { type: 'string' },
              type: { type: 'string' },
              enabled: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  async getPaymentMethods() {
    try {
      this.logger.log('Getting available payment methods');

      const result = await this.paymentService.getPaymentMethods();

      this.logger.log(`Retrieved ${result.methods.length} payment methods`);
      return result;
    } catch (error) {
      this.logger.error('Failed to get payment methods:', error.message);
      throw new BadRequestException(
        `Failed to get payment methods: ${error.message}`,
      );
    }
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Verify payment',
    description: 'Verifies payment status with payment gateway',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        transactionId: { type: 'string' },
      },
      required: ['orderId', 'transactionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Payment verification completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        verified: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async verifyPayment(
    @Body() body: { orderId: string; transactionId: string },
  ) {
    try {
      const { orderId, transactionId } = body;

      this.logger.log(`Verifying payment for order: ${orderId}`);

      const result = await this.paymentService.verifyPayment(
        orderId,
        transactionId,
      );

      this.logger.log(
        `Payment verification for ${orderId}: ${result.verified ? 'SUCCESS' : 'FAILED'}`,
      );
      return result;
    } catch (error) {
      this.logger.error('Failed to verify payment:', error.message);
      throw new BadRequestException(
        `Payment verification failed: ${error.message}`,
      );
    }
  }

  @Post('cancel/:orderId')
  @ApiOperation({
    summary: 'Cancel payment',
    description: 'Cancels a pending payment order',
  })
  @ApiParam({
    name: 'orderId',
    description: 'Order ID to cancel',
    example: '123456789',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment cancelled successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async cancelPayment(@Param('orderId') orderId: string) {
    try {
      this.logger.log(`Cancelling payment for order: ${orderId}`);

      const result = await this.paymentService.cancelPayment(orderId);

      this.logger.log(`Payment cancelled for order: ${orderId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to cancel payment for ${orderId}:`,
        error.message,
      );
      throw new BadRequestException(
        `Payment cancellation failed: ${error.message}`,
      );
    }
  }

  @Post('webhook/sepay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'SePay webhook endpoint',
    description: 'Handles payment status updates from SePay',
  })
  @ApiBody({ type: SepayWebhookDto })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid webhook data or signature',
  })
  async handleSepayWebhook(@Body() webhookData: SepayWebhookDto) {
    try {
      this.logger.log(
        `Received SePay webhook for order: ${webhookData.orderCode}`,
      );
      this.logger.debug('Webhook data:', {
        orderCode: webhookData.orderCode,
        status: webhookData.status,
        amount: webhookData.amount,
        transactionId: webhookData.transactionId,
      });

      const result = await this.paymentService.handleSepayWebhook(webhookData);

      this.logger.log(
        `SePay webhook processed successfully for order: ${webhookData.orderCode}`,
      );

      // Return simple response for webhook
      return {
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      this.logger.error('Failed to process SePay webhook:', error.message);

      // For webhooks, we should return success even if processing fails
      // to prevent the payment gateway from retrying indefinitely
      return {
        success: false,
        message: 'Webhook processing failed',
        error: error.message,
      };
    }
  }

  @Get('test-connection')
  @ApiOperation({
    summary: 'Test SePay connection',
    description: 'Tests the connection to SePay payment gateway',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection test result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async testConnection() {
    try {
      this.logger.log('Testing SePay connection');

      const result = await this.sepayService.testConnection();

      if (result.success) {
        this.logger.log('SePay connection test successful');
      } else {
        this.logger.warn('SePay connection test failed:', result.message);
      }

      return result;
    } catch (error) {
      this.logger.error('SePay connection test error:', error.message);
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
      };
    }
  }

  @Post('generate-qr')
  @ApiOperation({
    summary: 'Generate QR code for payment',
    description: 'Generates QR code for bank transfer payment',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        amount: { type: 'number' },
        bankCode: { type: 'string', nullable: true },
      },
      required: ['orderId', 'amount'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'QR code generated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        qrCodeUrl: { type: 'string', nullable: true },
        qrCodeData: { type: 'string', nullable: true },
        message: { type: 'string' },
      },
    },
  })
  async generateQRCode(
    @Body() body: { orderId: string; amount: number; bankCode?: string },
  ) {
    try {
      const { orderId, amount, bankCode } = body;

      this.logger.log(`Generating QR code for order: ${orderId}`);

      const result = await this.sepayService.generateQRCode(
        orderId,
        amount,
        bankCode,
      );

      this.logger.log(
        `QR code generation for ${orderId}: ${result.success ? 'SUCCESS' : 'FAILED'}`,
      );
      return result;
    } catch (error) {
      this.logger.error('Failed to generate QR code:', error.message);
      throw new BadRequestException(
        `QR code generation failed: ${error.message}`,
      );
    }
  }

  @Get('dashboard/stats')
  @ApiOperation({
    summary: 'Get payment statistics',
    description: 'Retrieves payment statistics for admin dashboard',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment statistics retrieved successfully',
  })
  async getPaymentStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      this.logger.log('Getting payment statistics');

      // This would be implemented based on your needs
      // For now, return basic stats
      return {
        success: true,
        stats: {
          totalOrders: 0,
          totalRevenue: 0,
          pendingPayments: 0,
          successfulPayments: 0,
          failedPayments: 0,
        },
        message: 'Payment statistics retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to get payment statistics:', error.message);
      throw new BadRequestException(
        `Failed to get payment statistics: ${error.message}`,
      );
    }
  }
}
