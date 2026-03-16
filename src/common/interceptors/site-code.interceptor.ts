import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

export const VALID_SITE_CODES = ['dieptra', 'lermao'] as const;
export type SiteCode = (typeof VALID_SITE_CODES)[number];
export const DEFAULT_SITE_CODE: SiteCode = 'dieptra';

@Injectable()
export class SiteCodeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const headerValue = (request.headers['x-site-code'] || '')
      .toLowerCase()
      .trim();

    request.siteCode = VALID_SITE_CODES.includes(headerValue as SiteCode)
      ? headerValue
      : DEFAULT_SITE_CODE;

    return next.handle();
  }
}
