// src/payment/payment.controller.ts - UPDATED with proper webhook handling
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  Logger,
  BadRequestException,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { SepayService, SepayWebhookPayload } from './sepay.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { Request } from 'express';

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
    description: 'Creates a new payment order with SePay QR code generation',
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
        qrCodeUrl: { type: 'string', nullable: true },
        qrCodeData: { type: 'string', nullable: true },
        bankInfo: {
          type: 'object',
          properties: {
            accountNumber: { type: 'string' },
            accountHolder: { type: 'string' },
            bankName: { type: 'string' },
            amount: { type: 'number' },
            transferContent: { type: 'string' },
          },
        },
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

  @Post('webhook/sepay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'SePay webhook endpoint',
    description:
      'Handles payment notifications from SePay when customers complete bank transfers',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'SePay API key in format: "Apikey YOUR_API_TOKEN"',
    required: true,
  })
  @ApiBody({
    description: 'SePay webhook payload',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Transaction ID on SePay' },
        gateway: {
          type: 'string',
          description: 'Bank name (e.g., "Vietcombank")',
        },
        transactionDate: {
          type: 'string',
          description: 'Transaction time "2023-03-25 14:02:37"',
        },
        accountNumber: { type: 'string', description: 'Bank account number' },
        code: {
          type: 'string',
          nullable: true,
          description: 'Payment code (auto-detected by SePay)',
        },
        content: { type: 'string', description: 'Transfer content' },
        transferType: {
          type: 'string',
          enum: ['in', 'out'],
          description: 'Transaction type',
        },
        transferAmount: { type: 'number', description: 'Transaction amount' },
        accumulated: { type: 'number', description: 'Account balance' },
        subAccount: {
          type: 'string',
          nullable: true,
          description: 'Sub account',
        },
        referenceCode: { type: 'string', description: 'SMS reference code' },
        description: { type: 'string', description: 'Full SMS content' },
      },
      required: [
        'id',
        'gateway',
        'transactionDate',
        'accountNumber',
        'content',
        'transferType',
        'transferAmount',
      ],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid webhook data or signature',
  })
  async handleSepayWebhook(
    @Body() webhookData: SepayWebhookPayload,
    @Headers() headers: Record<string, string>,
    @Req() request: Request,
  ) {
    try {
      this.logger.log(
        `Received SePay webhook for transaction ID: ${webhookData.id}`,
      );
      this.logger.debug('Webhook data:', {
        transactionId: webhookData.id,
        gateway: webhookData.gateway,
        amount: webhookData.transferAmount,
        transferType: webhookData.transferType,
        content: webhookData.content,
        code: webhookData.code,
      });

      // Log webhook headers for debugging (hide sensitive data)
      this.logger.debug('Webhook headers:', {
        authorization: headers.authorization
          ? headers.authorization.substring(0, 20) + '...'
          : 'missing',
        contentType: headers['content-type'],
        userAgent: headers['user-agent'],
      });

      const result = await this.paymentService.handleSepayWebhook(
        webhookData,
        headers,
      );

      if (result.success) {
        this.logger.log(
          `SePay webhook processed successfully for transaction: ${webhookData.id}`,
        );
      } else {
        this.logger.warn(
          `SePay webhook processing failed for transaction: ${webhookData.id} - ${result.message}`,
        );
      }

      // Return the required format for SePay webhook acknowledgment
      return {
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      this.logger.error('Failed to process SePay webhook:', error.message);

      // For webhooks, we should return success even if processing fails
      // to prevent the payment gateway from retrying indefinitely
      // But we'll return the actual error for debugging
      return {
        success: false,
        message: 'Webhook processing failed',
        error: error.message,
      };
    }
  }

  @Get('methods')
  @ApiOperation({
    summary: 'Get payment methods',
    description:
      'Retrieves available payment methods including COD and SePay bank transfer',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment methods retrieved successfully',
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
    description: 'Manually verifies payment status with transaction ID',
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

  @Get('test-connection')
  @ApiOperation({
    summary: 'Test SePay connection',
    description: 'Tests the SePay configuration and bank account setup',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection test result',
  })
  async testConnection() {
    try {
      this.logger.log('Testing SePay connection');

      const result = await this.sepayService.testConnection();
      const configStatus = this.sepayService.getConfigStatus();

      if (result.success) {
        this.logger.log('SePay connection test successful');
      } else {
        this.logger.warn('SePay connection test failed:', result.message);
      }

      return {
        ...result,
        configuration: configStatus,
      };
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
    description: 'Generates VietQR code for bank transfer payment',
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
  async getPaymentStats(
    @Param('startDate') startDate?: string,
    @Param('endDate') endDate?: string,
  ) {
    try {
      this.logger.log('Getting payment statistics');

      // Basic implementation - you can expand this based on your needs
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

  @Get('webhook/test')
  @ApiOperation({
    summary: 'Test webhook endpoint',
    description: 'Test endpoint to verify webhook URL is accessible',
  })
  async testWebhook() {
    return {
      success: true,
      message: 'Webhook endpoint is accessible',
      timestamp: new Date().toISOString(),
    };
  }
}
