// // src/payment/payment.controller.ts - ENHANCED with better debugging
// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Param,
//   Headers,
//   Logger,
//   BadRequestException,
//   UsePipes,
//   ValidationPipe,
//   HttpCode,
//   HttpStatus,
//   Req,
//   Ip,
//   Query,
// } from '@nestjs/common';
// import { PaymentService } from './payment.service';
// import { SepayService, SepayWebhookPayload } from './sepay.service';
// import { CreatePaymentDto } from './dto/create-payment.dto';
// import {
//   ApiTags,
//   ApiOperation,
//   ApiResponse,
//   ApiParam,
//   ApiBody,
//   ApiHeader,
// } from '@nestjs/swagger';
// import { Request } from 'express';
// import { PrismaClient } from '@prisma/client';

// @ApiTags('payment')
// @Controller('payment')
// export class PaymentController {
//   private readonly logger = new Logger(PaymentController.name);
//   prisma = new PrismaClient();

//   constructor(
//     private readonly paymentService: PaymentService,
//     private readonly sepayService: SepayService,
//   ) {}

//   @Post('create')
//   @ApiOperation({
//     summary: 'Create payment order',
//     description: 'Creates a new payment order with SePay QR code generation',
//   })
//   @UsePipes(new ValidationPipe({ transform: true }))
//   async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
//     try {
//       this.logger.log('=== PAYMENT CREATION START ===');
//       this.logger.log('Payment request data:', {
//         customerName: createPaymentDto.customerInfo.fullName,
//         itemCount: createPaymentDto.cartItems.length,
//         total: createPaymentDto.amounts.total,
//         paymentMethod: createPaymentDto.paymentMethod,
//       });

//       const result = await this.paymentService.createPayment(createPaymentDto);

//       this.logger.log(`Payment order created: ${result.orderId}`);
//       this.logger.log('=== PAYMENT CREATION END ===');

//       return result;
//     } catch (error) {
//       this.logger.error('=== PAYMENT CREATION FAILED ===');
//       this.logger.error('Error details:', error.message);
//       this.logger.error('Error stack:', error.stack);
//       throw new BadRequestException(
//         `Payment creation failed: ${error.message}`,
//       );
//     }
//   }

//   @Post('debug/check-transaction/:orderCode')
//   @ApiOperation({
//     summary: 'Manually check transaction status from SePay',
//     description: 'Checks SePay API for transactions matching the order code',
//   })
//   async checkTransaction(@Param('orderCode') orderCode: string) {
//     try {
//       this.logger.log(
//         `🔍 Manually checking transaction for order: ${orderCode}`,
//       );

//       const result = await this.sepayService.checkTransactionStatus(orderCode);

//       return {
//         success: true,
//         orderCode,
//         transactions: result,
//         timestamp: new Date().toISOString(),
//       };
//     } catch (error) {
//       this.logger.error(`❌ Failed to check transaction:`, error.message);
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   @Post('debug/process-manual-webhook')
//   @ApiOperation({
//     summary: 'Manually process a transaction as webhook',
//     description: 'Manually creates a webhook payload from transaction data',
//   })
//   async processManualWebhook(
//     @Body()
//     data: {
//       orderId: string;
//       transactionId: number;
//       amount: number;
//       content: string;
//       gateway: string;
//     },
//   ) {
//     try {
//       this.logger.log(
//         `🔧 Manually processing webhook for order: ${data.orderId}`,
//       );

//       // Find the order
//       const order = await this.paymentService.getPaymentStatus(data.orderId);

//       // Create webhook payload
//       const webhookPayload: SepayWebhookPayload = {
//         id: data.transactionId,
//         gateway: data.gateway || 'Manual',
//         transactionDate: new Date()
//           .toISOString()
//           .replace('T', ' ')
//           .slice(0, 19),
//         accountNumber: process.env.SEPAY_BANK_ACCOUNT || '',
//         code: order.sepayOrderCode || null,
//         content: data.content,
//         transferType: 'in',
//         transferAmount: data.amount,
//         accumulated: 0,
//         subAccount: null,
//         referenceCode: `MANUAL${data.transactionId}`,
//         description: data.content,
//       };

//       // Process the webhook
//       const headers = {
//         authorization: `Apikey ${process.env.SEPAY_API_TOKEN}`,
//       };

//       const result = await this.paymentService.handleSepayWebhook(
//         webhookPayload,
//         headers,
//       );

//       return {
//         success: result.success,
//         message: result.message,
//         processedData: webhookPayload,
//       };
//     } catch (error) {
//       this.logger.error(`❌ Manual webhook processing failed:`, error.message);
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   @Get('debug/webhook-logs')
//   @ApiOperation({
//     summary: 'Get recent webhook logs',
//     description: 'Returns recent webhook processing logs for debugging',
//   })
//   async getWebhookLogs(@Query('limit') limit: number = 10) {
//     try {
//       // This will help you see what webhooks were received
//       const logs = await this.prisma.webhook_log.findMany({
//         take: limit,
//         orderBy: { created_at: 'desc' },
//         select: {
//           id: true,
//           webhook_type: true,
//           payload: true,
//           headers: true,
//           processed: true,
//           error_message: true,
//           created_at: true,
//         },
//       });

//       return {
//         success: true,
//         logs: logs,
//         count: logs.length,
//         timestamp: new Date().toISOString(),
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: error.message,
//         logs: [],
//       };
//     }
//   }

//   @Post('debug/test-order-extraction')
//   @ApiOperation({
//     summary: 'Test order code extraction',
//     description:
//       'Test the order code extraction logic with different content formats',
//   })
//   async testOrderExtraction(@Body() data: { content: string }) {
//     try {
//       const extractedCode = this.sepayService['extractOrderCodeFromContent'](
//         data.content,
//       );

//       return {
//         success: true,
//         input: data.content,
//         extractedCode: extractedCode,
//         found: !!extractedCode,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   @Post('webhook/sepay')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({
//     summary: 'SePay webhook endpoint',
//     description: 'Handles payment notifications from SePay',
//   })
//   async handleSepayWebhook(
//     @Body() webhookData: SepayWebhookPayload,
//     @Headers() headers: Record<string, string>,
//     @Req() request: Request,
//     @Ip() clientIp: string,
//   ) {
//     const startTime = Date.now();
//     const webhookId = `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

//     try {
//       this.logger.log('=================================================');
//       this.logger.log(`=== SEPAY WEBHOOK RECEIVED [${webhookId}] ===`);
//       this.logger.log('=================================================');

//       // Log request details
//       this.logger.log('📥 WEBHOOK REQUEST DETAILS:', {
//         webhookId,
//         timestamp: new Date().toISOString(),
//         clientIp,
//         userAgent: headers['user-agent'],
//         contentType: headers['content-type'],
//         contentLength: headers['content-length'],
//       });

//       // Log SePay specific details
//       this.logger.log('🏦 SEPAY TRANSACTION DATA:', {
//         transactionId: webhookData.id,
//         gateway: webhookData.gateway,
//         transactionDate: webhookData.transactionDate,
//         accountNumber: webhookData.accountNumber,
//         transferType: webhookData.transferType,
//         transferAmount: webhookData.transferAmount,
//         code: webhookData.code,
//         content: webhookData.content,
//         referenceCode: webhookData.referenceCode,
//       });

//       // Log authorization header (safely)
//       const authHeader = headers.authorization || headers.Authorization;
//       this.logger.log('🔐 AUTHORIZATION CHECK:', {
//         hasAuthHeader: !!authHeader,
//         authHeaderPreview: authHeader
//           ? authHeader.substring(0, 15) + '...'
//           : 'MISSING',
//         expectedFormat: 'Apikey YOUR_TOKEN',
//       });

//       // Verify this is from SePay IP
//       const sepayIp = '103.255.238.9';
//       const isFromSepayIp =
//         clientIp === sepayIp ||
//         request.headers['x-forwarded-for']?.includes(sepayIp) ||
//         request.headers['x-real-ip'] === sepayIp;

//       this.logger.log('🌐 IP VERIFICATION:', {
//         clientIp,
//         sepayIp,
//         isFromSepayIp,
//         forwardedFor: request.headers['x-forwarded-for'],
//         realIp: request.headers['x-real-ip'],
//       });

//       if (!isFromSepayIp) {
//         this.logger.warn('⚠️  WARNING: Request not from SePay IP');
//       }

//       // Process the webhook
//       this.logger.log('⚙️  PROCESSING WEBHOOK...');
//       const result = await this.paymentService.handleSepayWebhook(
//         webhookData,
//         headers,
//       );

//       const processingTime = Date.now() - startTime;

//       if (result.success) {
//         this.logger.log('✅ WEBHOOK PROCESSED SUCCESSFULLY:', {
//           webhookId,
//           processingTimeMs: processingTime,
//           message: result.message,
//         });
//       } else {
//         this.logger.error('❌ WEBHOOK PROCESSING FAILED:', {
//           webhookId,
//           processingTimeMs: processingTime,
//           error: result.message,
//         });
//       }

//       this.logger.log('=================================================');
//       this.logger.log(`=== SEPAY WEBHOOK END [${webhookId}] ===`);
//       this.logger.log('=================================================');

//       // Always return success to prevent SePay from retrying
//       return {
//         success: true,
//         message: result.success ? 'OK' : 'Processed with errors',
//         webhookId,
//         processingTimeMs: processingTime,
//       };
//     } catch (error) {
//       const processingTime = Date.now() - startTime;

//       this.logger.error('💥 CRITICAL WEBHOOK ERROR:', {
//         webhookId,
//         error: error.message,
//         stack: error.stack,
//         processingTimeMs: processingTime,
//       });

//       // Still return success to prevent infinite retries
//       return {
//         success: true,
//         message: 'Error logged',
//         webhookId,
//         error: error.message,
//       };
//     }
//   }

//   @Get('webhook/test')
//   @ApiOperation({
//     summary: 'Test webhook endpoint accessibility',
//     description: 'Simple endpoint to verify webhook URL is accessible',
//   })
//   async testWebhook(@Req() request: Request, @Ip() clientIp: string) {
//     this.logger.log('🧪 WEBHOOK TEST ENDPOINT ACCESSED:', {
//       timestamp: new Date().toISOString(),
//       clientIp,
//       userAgent: request.headers['user-agent'],
//       method: request.method,
//       url: request.url,
//     });

//     return {
//       success: true,
//       message: 'Webhook endpoint is accessible',
//       timestamp: new Date().toISOString(),
//       clientIp,
//       sepayIpExpected: '103.255.238.9',
//     };
//   }

//   @Get('test-connection')
//   @ApiOperation({
//     summary: 'Test SePay configuration',
//     description: 'Tests SePay configuration and connectivity',
//   })
//   async testConnection() {
//     try {
//       this.logger.log('🔧 TESTING SEPAY CONNECTION...');

//       const sepayTest = await this.sepayService.testConnection();
//       const configStatus = this.sepayService.getConfigStatus();

//       this.logger.log('📊 SEPAY CONFIGURATION STATUS:', configStatus);

//       const testResult = {
//         sepayService: sepayTest,
//         configuration: configStatus,
//         environment: {
//           nodeEnv: process.env.NODE_ENV,
//           hasApiToken: !!process.env.SEPAY_API_TOKEN,
//           hasBankAccount: !!process.env.SEPAY_BANK_ACCOUNT,
//           hasBankName: !!process.env.SEPAY_BANK_NAME,
//           hasWebhookUrl: !!process.env.SEPAY_WEBHOOK_URL,
//         },
//         recommendations: [],
//       };

//       this.logger.log('✅ CONNECTION TEST COMPLETED:', {
//         success: sepayTest.success,
//         configured: configStatus.configured,
//       });

//       return testResult;
//     } catch (error) {
//       this.logger.error('❌ CONNECTION TEST FAILED:', error.message);
//       return {
//         success: false,
//         message: `Connection test failed: ${error.message}`,
//         error: error.stack,
//       };
//     }
//   }

//   @Get('status/:orderId')
//   @ApiOperation({
//     summary: 'Get payment status',
//     description: 'Retrieves the current status of a payment order',
//   })
//   async getPaymentStatus(@Param('orderId') orderId: string) {
//     try {
//       this.logger.log(`📋 Getting payment status for order: ${orderId}`);

//       const result = await this.paymentService.getPaymentStatus(orderId);

//       this.logger.log(`💳 Payment status for ${orderId}: ${result.status}`);
//       return result;
//     } catch (error) {
//       this.logger.error(
//         `❌ Failed to get payment status for ${orderId}:`,
//         error.message,
//       );
//       throw new BadRequestException(
//         `Failed to get payment status: ${error.message}`,
//       );
//     }
//   }

//   @Get('methods')
//   @ApiOperation({
//     summary: 'Get available payment methods',
//     description: 'Retrieves available payment methods including SePay status',
//   })
//   async getPaymentMethods() {
//     try {
//       this.logger.log('💰 Getting available payment methods');

//       const result = await this.paymentService.getPaymentMethods();

//       this.logger.log(`📋 Retrieved ${result.methods.length} payment methods`);
//       return result;
//     } catch (error) {
//       this.logger.error('❌ Failed to get payment methods:', error.message);
//       throw new BadRequestException(
//         `Failed to get payment methods: ${error.message}`,
//       );
//     }
//   }

//   @Post('generate-qr')
//   @ApiOperation({
//     summary: 'Generate QR code for testing',
//     description: 'Generates VietQR code for testing purposes',
//   })
//   async generateQRCode(
//     @Body() body: { orderId: string; amount: number; bankCode?: string },
//   ) {
//     try {
//       const { orderId, amount, bankCode } = body;

//       this.logger.log(
//         `🏷️  Generating QR code for order: ${orderId}, amount: ${amount}`,
//       );

//       const result = await this.sepayService.generateQRCode(
//         orderId,
//         amount,
//         bankCode,
//       );

//       this.logger.log(`📱 QR code generation result:`, {
//         orderId,
//         success: result.success,
//         hasQrUrl: !!result.qrCodeUrl,
//       });

//       return result;
//     } catch (error) {
//       this.logger.error('❌ Failed to generate QR code:', error.message);
//       throw new BadRequestException(
//         `QR code generation failed: ${error.message}`,
//       );
//     }
//   }

//   @Post('verify')
//   @ApiOperation({
//     summary: 'Manually verify payment',
//     description: 'Manually verifies payment status',
//   })
//   async verifyPayment(
//     @Body() body: { orderId: string; transactionId: string },
//   ) {
//     try {
//       const { orderId, transactionId } = body;

//       this.logger.log(`🔍 Manually verifying payment:`, {
//         orderId,
//         transactionId,
//       });

//       const result = await this.paymentService.verifyPayment(
//         orderId,
//         transactionId,
//       );

//       this.logger.log(`✅ Manual verification result:`, {
//         orderId,
//         verified: result.verified,
//       });

//       return result;
//     } catch (error) {
//       this.logger.error('❌ Manual verification failed:', error.message);
//       throw new BadRequestException(
//         `Payment verification failed: ${error.message}`,
//       );
//     }
//   }

//   @Post('cancel/:orderId')
//   @ApiOperation({
//     summary: 'Cancel payment order',
//     description: 'Cancels a pending payment order',
//   })
//   async cancelPayment(@Param('orderId') orderId: string) {
//     try {
//       this.logger.log(`🚫 Cancelling payment for order: ${orderId}`);

//       const result = await this.paymentService.cancelPayment(orderId);

//       this.logger.log(`✅ Payment cancelled for order: ${orderId}`);
//       return result;
//     } catch (error) {
//       this.logger.error(
//         `❌ Failed to cancel payment for ${orderId}:`,
//         error.message,
//       );
//       throw new BadRequestException(
//         `Payment cancellation failed: ${error.message}`,
//       );
//     }
//   }

//   @Get('debug/config')
//   @ApiOperation({
//     summary: 'Get configuration debug info',
//     description: 'Returns configuration details for debugging',
//   })
//   async getDebugConfig() {
//     try {
//       const configStatus = this.sepayService.getConfigStatus();

//       return {
//         success: true,
//         configuration: configStatus,
//         environment: {
//           NODE_ENV: process.env.NODE_ENV,
//           SEPAY_API_TOKEN: process.env.SEPAY_API_TOKEN
//             ? '***SET***'
//             : 'NOT SET',
//           SEPAY_BANK_ACCOUNT: process.env.SEPAY_BANK_ACCOUNT
//             ? '***SET***'
//             : 'NOT SET',
//           SEPAY_BANK_NAME: process.env.SEPAY_BANK_NAME || 'NOT SET',
//           SEPAY_ACCOUNT_HOLDER: process.env.SEPAY_ACCOUNT_HOLDER
//             ? '***SET***'
//             : 'NOT SET',
//           SEPAY_WEBHOOK_URL: process.env.SEPAY_WEBHOOK_URL || 'NOT SET',
//         },
//         webhookTest: {
//           endpoint: '/api/payment/webhook/sepay',
//           testEndpoint: '/api/payment/webhook/test',
//           expectedIp: '103.255.238.9',
//         },
//         timestamp: new Date().toISOString(),
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   @Post('debug/simulate-webhook')
//   @ApiOperation({
//     summary: 'Simulate SePay webhook for testing',
//     description: 'Simulates a SePay webhook call for testing purposes',
//   })
//   async simulateWebhook(
//     @Body()
//     simulationData: {
//       orderId: string;
//       amount: number;
//       transactionId?: number;
//       useSepayCode?: boolean; // NEW: Option to use SePay order code format
//     },
//     @Headers() headers: Record<string, string>,
//   ) {
//     try {
//       const {
//         orderId,
//         amount,
//         transactionId = 999999,
//         useSepayCode = true,
//       } = simulationData;

//       this.logger.log('🧪 SIMULATING SEPAY WEBHOOK:', {
//         orderId,
//         amount,
//         transactionId,
//         useSepayCode,
//       });

//       // FIXED: Use proper order code format
//       let orderCodeToUse = orderId;

//       if (useSepayCode) {
//         // Try to find the order first to get the proper SePay order code
//         try {
//           const orderStatus =
//             await this.paymentService.getPaymentStatus(orderId);
//           if (orderStatus.sepayOrderCode) {
//             orderCodeToUse = orderStatus.sepayOrderCode;
//             this.logger.log(
//               `Using SePay order code from database: ${orderCodeToUse}`,
//             );
//           } else {
//             // Generate a mock SePay order code
//             orderCodeToUse = `DT${Date.now().toString().slice(-8)}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
//             this.logger.log(
//               `Generated mock SePay order code: ${orderCodeToUse}`,
//             );
//           }
//         } catch (error) {
//           this.logger.warn(
//             `Could not find order ${orderId}, using provided orderId`,
//           );
//         }
//       }

//       // Create mock webhook payload
//       const mockWebhookData: SepayWebhookPayload = {
//         id: transactionId,
//         gateway: 'TestBank',
//         transactionDate: new Date()
//           .toISOString()
//           .replace('T', ' ')
//           .slice(0, 19),
//         accountNumber: process.env.SEPAY_BANK_ACCOUNT || '1234567890',
//         code: orderCodeToUse, // Use the proper order code
//         content: `${orderCodeToUse} Test payment simulation`,
//         transferType: 'in',
//         transferAmount: amount,
//         accumulated: 1000000,
//         subAccount: null,
//         referenceCode: `TEST${transactionId}`,
//         description: `Test webhook simulation for ${orderCodeToUse}`,
//       };

//       // Add proper authorization header
//       const mockHeaders = {
//         ...headers,
//         authorization: `Apikey ${process.env.SEPAY_API_TOKEN}`,
//         'content-type': 'application/json',
//         'user-agent': 'SePay-Webhook-Simulator',
//       };

//       // Process the simulated webhook
//       const result = await this.paymentService.handleSepayWebhook(
//         mockWebhookData,
//         mockHeaders,
//       );

//       this.logger.log('🧪 WEBHOOK SIMULATION RESULT:', result);

//       return {
//         success: true,
//         message: 'Webhook simulation completed',
//         simulationData: mockWebhookData,
//         processingResult: result,
//         orderCodeUsed: orderCodeToUse,
//       };
//     } catch (error) {
//       this.logger.error('❌ Webhook simulation failed:', error.message);
//       return {
//         success: false,
//         message: 'Webhook simulation failed',
//         error: error.message,
//       };
//     }
//   }

//   // NEW: Debug endpoint to list pending orders
//   @Get('debug/pending-orders')
//   @ApiOperation({
//     summary: 'List pending orders for debugging',
//     description: 'Returns a list of pending payment orders for troubleshooting',
//   })
//   async listPendingOrders() {
//     try {
//       this.logger.log('🔍 Listing pending orders for debugging');

//       const orders = await this.paymentService.listPendingOrders();

//       this.logger.log(`Found ${orders.length} pending orders`);

//       return {
//         success: true,
//         pendingOrders: orders,
//         count: orders.length,
//         timestamp: new Date().toISOString(),
//       };
//     } catch (error) {
//       this.logger.error('❌ Failed to list pending orders:', error.message);
//       return {
//         success: false,
//         error: error.message,
//         pendingOrders: [],
//       };
//     }
//   }

//   // NEW: Manual webhook trigger by order ID
//   @Post('debug/trigger-webhook/:orderId')
//   @ApiOperation({
//     summary: 'Manually trigger webhook for specific order',
//     description:
//       'Manually triggers a webhook for a specific order (for testing)',
//   })
//   async triggerWebhookForOrder(
//     @Param('orderId') orderId: string,
//     @Query('amount') amount?: number,
//   ) {
//     try {
//       this.logger.log(`🎯 Manually triggering webhook for order: ${orderId}`);

//       // Get order details
//       const orderStatus = await this.paymentService.getPaymentStatus(orderId);

//       const mockAmount = amount || orderStatus.amount;
//       const orderCode =
//         orderStatus.sepayOrderCode ||
//         `DT${Date.now().toString().slice(-8)}MOCK`;

//       const simulationData = {
//         orderId: orderId,
//         amount: mockAmount,
//         transactionId: Date.now(),
//         useSepayCode: true,
//       };

//       // Reuse the simulation logic
//       const result = await this.simulateWebhook(simulationData, {
//         authorization: `Apikey ${process.env.SEPAY_API_TOKEN}`,
//       });

//       this.logger.log(
//         `🎯 Manual webhook trigger result for ${orderId}:`,
//         result,
//       );

//       return {
//         success: true,
//         message: `Manual webhook triggered for order ${orderId}`,
//         orderId,
//         orderCode,
//         amount: mockAmount,
//         result,
//       };
//     } catch (error) {
//       this.logger.error(
//         `❌ Failed to trigger webhook for ${orderId}:`,
//         error.message,
//       );
//       return {
//         success: false,
//         message: `Failed to trigger webhook for order ${orderId}`,
//         error: error.message,
//       };
//     }
//   }
// }
