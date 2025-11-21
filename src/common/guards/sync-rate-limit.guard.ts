import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SYNC_OPERATION_KEY } from '../decorators/kiotviet-sync.decorator';

@Injectable()
export class SyncRateLimitGuard implements CanActivate {
  private syncOperations = new Map<string, number>();
  private readonly cooldownPeriod = 60000;

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const syncOperation = this.reflector.getAllAndOverride<string>(
      SYNC_OPERATION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!syncOperation) {
      return true;
    }

    const now = Date.now();
    const lastSync = this.syncOperations.get(syncOperation);

    if (lastSync && now - lastSync < this.cooldownPeriod) {
      const remainingTime = Math.ceil(
        (this.cooldownPeriod - (now - lastSync)) / 1000,
      );
      throw new HttpException(
        `Sync operation "${syncOperation}" is on cooldown. Please wait ${remainingTime} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.syncOperations.set(syncOperation, now);
    return true;
  }
}
