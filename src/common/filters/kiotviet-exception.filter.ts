import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class KiotVietExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(KiotVietExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Only handle KiotViet-related errors
    if (!request.url.includes('kiotviet')) {
      throw exception;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'KiotViet operation failed';
    let details = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();
      message =
        typeof errorResponse === 'string'
          ? errorResponse
          : (errorResponse as any).message;
      details = typeof errorResponse === 'object' ? errorResponse : {};
    } else if (exception instanceof Error) {
      message = exception.message;
      details = { stack: exception.stack };
    }

    this.logger.error(`KiotViet Error: ${message}`, {
      url: request.url,
      method: request.method,
      status,
      details,
    });

    response.status(status).json({
      success: false,
      statusCode: status,
      message: `KiotViet Integration Error: ${message}`,
      error: 'KiotViet API Error',
      timestamp: new Date().toISOString(),
      path: request.url,
      details: process.env.NODE_ENV === 'development' ? details : undefined,
    });
  }
}
