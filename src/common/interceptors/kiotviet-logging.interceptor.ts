import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class KiotVietLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(KiotVietLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query } = request;
    const startTime = Date.now();

    // Log KiotViet operations
    if (url.includes('kiotviet')) {
      this.logger.log(`KiotViet Operation Started: ${method} ${url}`);
      if (Object.keys(query).length > 0) {
        this.logger.log(`Query Parameters: ${JSON.stringify(query)}`);
      }
      if (body && Object.keys(body).length > 0) {
        this.logger.log(`Request Body: ${JSON.stringify(body)}`);
      }
    }

    return next.handle().pipe(
      tap((response) => {
        if (url.includes('kiotviet')) {
          const duration = Date.now() - startTime;
          this.logger.log(
            `KiotViet Operation Completed: ${method} ${url} - ${duration}ms`,
          );

          // Log summary for sync operations
          if (response?.summary) {
            this.logger.log(
              `Sync Summary: ${JSON.stringify(response.summary)}`,
            );
          }
        }
      }),
      catchError((error) => {
        if (url.includes('kiotviet')) {
          const duration = Date.now() - startTime;
          this.logger.error(
            `KiotViet Operation Failed: ${method} ${url} - ${duration}ms - ${error.message}`,
          );
        }
        return throwError(() => error);
      }),
    );
  }
}
