import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DEFAULT_SITE_CODE } from '../interceptors/site-code.interceptor';

export const CurrentSiteCode = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.siteCode || DEFAULT_SITE_CODE;
  },
);
