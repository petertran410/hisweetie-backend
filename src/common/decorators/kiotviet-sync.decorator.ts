import { SetMetadata } from '@nestjs/common';

export const SYNC_OPERATION_KEY = 'syncOperation';
export const SyncOperation = (operation: string) =>
  SetMetadata(SYNC_OPERATION_KEY, operation);
