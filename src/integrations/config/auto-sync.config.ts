// src/integrations/config/auto-sync.config.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AutoSyncConfig {
  constructor(private readonly configService: ConfigService) {}

  // 🚀 AUTO-START CONFIGURATION
  get autoStartEnabled(): boolean {
    return (
      this.configService.get<string>('AUTO_SYNC_ENABLED', 'true') === 'true'
    );
  }

  get autoStartDelay(): number {
    return (
      parseInt(
        this.configService.get<string>('AUTO_START_DELAY_SECONDS', '5'),
      ) * 1000
    );
  }

  // ⏰ SCHEDULED SYNC CONFIGURATION
  get incrementalSyncEnabled(): boolean {
    return (
      this.configService.get<string>('INCREMENTAL_SYNC_ENABLED', 'true') ===
      'true'
    );
  }

  get incrementalSyncInterval(): string {
    // Default: mỗi 30 phút, có thể customize qua env
    return this.configService.get<string>(
      'INCREMENTAL_SYNC_CRON',
      '*/30 * * * *',
    );
  }

  get fullSyncEnabled(): boolean {
    return (
      this.configService.get<string>('FULL_SYNC_ENABLED', 'true') === 'true'
    );
  }

  get fullSyncTime(): string {
    // Default: 2:00 AM mỗi ngày, có thể customize
    return this.configService.get<string>('FULL_SYNC_CRON', '0 2 * * *');
  }

  // 📊 MONITORING CONFIGURATION
  get statusReportEnabled(): boolean {
    return (
      this.configService.get<string>('STATUS_REPORT_ENABLED', 'true') === 'true'
    );
  }

  get statusReportInterval(): string {
    return this.configService.get<string>('STATUS_REPORT_CRON', '0 * * * *'); // Mỗi giờ
  }

  // 🔄 RETRY CONFIGURATION
  get autoRetryEnabled(): boolean {
    return (
      this.configService.get<string>('AUTO_RETRY_ENABLED', 'true') === 'true'
    );
  }

  get retryDelay(): number {
    return (
      parseInt(this.configService.get<string>('RETRY_DELAY_MINUTES', '5')) *
      60 *
      1000
    );
  }

  get maxRetries(): number {
    return parseInt(this.configService.get<string>('MAX_RETRIES', '3'));
  }

  // 🚨 ERROR HANDLING
  get errorNotificationEnabled(): boolean {
    return (
      this.configService.get<string>('ERROR_NOTIFICATION_ENABLED', 'false') ===
      'true'
    );
  }

  get errorWebhookUrl(): string {
    return this.configService.get<string>('ERROR_WEBHOOK_URL', '');
  }

  // 🎯 SYNC BEHAVIOR
  get initialSyncMode(): 'full' | 'incremental' | 'smart' {
    return this.configService.get<string>('INITIAL_SYNC_MODE', 'smart') as
      | 'full'
      | 'incremental'
      | 'smart';
  }

  get deleteObsoleteRecords(): boolean {
    return (
      this.configService.get<string>('DELETE_OBSOLETE_RECORDS', 'false') ===
      'true'
    );
  }

  get batchSize(): number {
    return parseInt(this.configService.get<string>('SYNC_BATCH_SIZE', '100'));
  }

  get rateLimitDelay(): number {
    return parseInt(
      this.configService.get<string>('RATE_LIMIT_DELAY_MS', '200'),
    );
  }

  // 📝 LOGGING
  get verboseLogging(): boolean {
    return this.configService.get<string>('VERBOSE_LOGGING', 'true') === 'true';
  }

  get logSyncStats(): boolean {
    return this.configService.get<string>('LOG_SYNC_STATS', 'true') === 'true';
  }

  // 🎊 SUMMARY METHOD
  getConfigSummary() {
    return {
      autoStart: {
        enabled: this.autoStartEnabled,
        delay: this.autoStartDelay / 1000 + 's',
      },
      scheduledSync: {
        incremental: {
          enabled: this.incrementalSyncEnabled,
          cron: this.incrementalSyncInterval,
        },
        full: {
          enabled: this.fullSyncEnabled,
          cron: this.fullSyncTime,
        },
      },
      monitoring: {
        statusReport: this.statusReportEnabled,
        errorNotification: this.errorNotificationEnabled,
      },
      behavior: {
        initialMode: this.initialSyncMode,
        deleteObsolete: this.deleteObsoleteRecords,
        batchSize: this.batchSize,
      },
    };
  }
}
