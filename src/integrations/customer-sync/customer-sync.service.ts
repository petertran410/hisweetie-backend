// src/integrations/customer-sync/customer-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  KiotVietService,
  KiotVietCustomer,
} from '../kiotviet/kiotviet.service';
import { LarkService, LarkRecord } from '../lark/lark.service';

export interface SyncStats {
  totalKiotVietCustomers: number;
  totalLarkRecords: number;
  created: number;
  updated: number;
  deleted: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
  duration?: string;
}

export interface CustomerMapping {
  customerCode: string;
  recordId: string;
  lastSyncDate: Date;
}

@Injectable()
export class CustomerSyncService {
  private readonly logger = new Logger(CustomerSyncService.name);
  private isRunning = false;
  private lastFullSyncDate: Date | null = null;
  private isInitialized = false;

  // In-memory cache of customer mappings (trong production nên dùng Redis hoặc database)
  private customerMappings = new Map<string, CustomerMapping>();

  constructor(
    private readonly kiotVietService: KiotVietService,
    private readonly larkService: LarkService,
  ) {
    // Tự động khởi tạo hệ thống khi service được tạo
    this.initializeSystem();
  }

  /**
   * 🚀 AUTO-INITIALIZATION: Tự động chạy khi app start
   */
  private async initializeSystem(): Promise<void> {
    try {
      this.logger.log(
        '🚀 AUTO-INITIALIZATION: Starting Customer Sync System...',
      );

      // Delay 5 giây để đảm bảo app đã start hoàn toàn
      setTimeout(async () => {
        try {
          await this.performInitialSync();
          this.isInitialized = true;
          this.logger.log(
            '✅ Customer Sync System initialized successfully and running automatically!',
          );
        } catch (error) {
          this.logger.error('❌ Auto-initialization failed:', error.message);
          // Retry sau 5 phút
          setTimeout(() => this.initializeSystem(), 5 * 60 * 1000);
        }
      }, 5000);
    } catch (error) {
      this.logger.error('Error during system initialization:', error.message);
    }
  }

  /**
   * 🔄 INITIAL SYNC: Chạy lần đầu khi start app
   */
  private async performInitialSync(): Promise<void> {
    this.logger.log('🔄 Running initial sync on system startup...');

    try {
      // Kiểm tra xem đã có data trong Lark Base chưa
      const existingRecords = await this.larkService.getAllRecords();

      if (existingRecords.length === 0) {
        // Nếu chưa có data, chạy full sync
        this.logger.log(
          '📥 No existing data found. Running initial full sync...',
        );
        await this.performFullSync();
      } else {
        // Nếu đã có data, chỉ cần build mappings và chạy incremental
        this.logger.log(
          '📋 Existing data found. Building mappings and running incremental sync...',
        );
        await this.buildCustomerMappings(existingRecords);
        await this.performIncrementalSync();
      }

      this.logger.log('✅ Initial sync completed successfully!');
    } catch (error) {
      this.logger.error('❌ Initial sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Full sync - Đồng bộ toàn bộ khách hàng từ KiotViet vào Lark Base
   */
  async performFullSync(): Promise<SyncStats> {
    if (this.isRunning) {
      throw new Error(
        'Sync is already running. Please wait for it to complete.',
      );
    }

    this.isRunning = true;
    const stats: SyncStats = {
      totalKiotVietCustomers: 0,
      totalLarkRecords: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: 0,
      startTime: new Date(),
    };

    try {
      this.logger.log('Starting full sync from KiotViet to Lark Base');

      // Step 1: Fetch all customers from KiotViet
      this.logger.log('Fetching all customers from KiotViet...');
      const kiotVietCustomers = await this.kiotVietService.getAllCustomers();
      stats.totalKiotVietCustomers = kiotVietCustomers.length;
      this.logger.log(
        `Found ${kiotVietCustomers.length} customers in KiotViet`,
      );

      // Step 2: Fetch all records from Lark Base
      this.logger.log('Fetching all records from Lark Base...');
      const larkRecords = await this.larkService.getAllRecords();
      stats.totalLarkRecords = larkRecords.length;
      this.logger.log(`Found ${larkRecords.length} records in Lark Base`);

      // Step 3: Build mapping of existing records
      await this.buildCustomerMappings(larkRecords);

      // Step 4: Determine what needs to be created, updated, or deleted
      const { toCreate, toUpdate, toDelete } = await this.analyzeChanges(
        kiotVietCustomers,
        larkRecords,
      );

      this.logger.log(
        `Analysis complete: ${toCreate.length} to create, ${toUpdate.length} to update, ${toDelete.length} to delete`,
      );

      // Step 5: Create new records
      if (toCreate.length > 0) {
        this.logger.log(`Creating ${toCreate.length} new records...`);
        try {
          const createdRecords =
            await this.larkService.batchCreateRecords(toCreate);
          stats.created = createdRecords.length;

          // Update mappings for new records
          for (
            let i = 0;
            i < toCreate.length && i < createdRecords.length;
            i++
          ) {
            const customer = toCreate[i];
            const record = createdRecords[i];
            if (customer.code && record.record_id) {
              this.customerMappings.set(customer.code, {
                customerCode: customer.code,
                recordId: record.record_id,
                lastSyncDate: new Date(),
              });
            }
          }
        } catch (error) {
          this.logger.error('Error creating records:', error.message);
          stats.errors++;
        }
      }

      // Step 6: Update existing records
      if (toUpdate.length > 0) {
        this.logger.log(`Updating ${toUpdate.length} existing records...`);
        try {
          const updatedRecords =
            await this.larkService.batchUpdateRecords(toUpdate);
          stats.updated = updatedRecords.length;

          // Update mapping timestamps
          toUpdate.forEach((update) => {
            const mapping = this.customerMappings.get(update.customer.code);
            if (mapping) {
              mapping.lastSyncDate = new Date();
            }
          });
        } catch (error) {
          this.logger.error('Error updating records:', error.message);
          stats.errors++;
        }
      }

      // Step 7: Delete obsolete records (optional - có thể comment out nếu không muốn xóa)
      if (toDelete.length > 0) {
        this.logger.log(`Deleting ${toDelete.length} obsolete records...`);
        try {
          await this.larkService.batchDeleteRecords(toDelete);
          stats.deleted = toDelete.length;

          // Remove from mappings
          larkRecords.forEach((record) => {
            if (toDelete.includes(record.record_id)) {
              const customerCode = record.fields['fldW0iwzXc']; // Mã Khách Hàng field
              if (customerCode) {
                this.customerMappings.delete(customerCode);
              }
            }
          });
        } catch (error) {
          this.logger.error('Error deleting records:', error.message);
          stats.errors++;
        }
      }

      this.lastFullSyncDate = new Date();
      stats.endTime = new Date();
      stats.duration = this.formatDuration(stats.startTime, stats.endTime);

      this.logger.log(
        `Full sync completed successfully: Created ${stats.created}, Updated ${stats.updated}, Deleted ${stats.deleted}, Errors ${stats.errors}`,
      );

      return stats;
    } catch (error) {
      stats.endTime = new Date();
      stats.duration = this.formatDuration(stats.startTime, stats.endTime);
      stats.errors++;

      this.logger.error('Full sync failed:', error.message);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Incremental sync - Chỉ đồng bộ những khách hàng đã thay đổi
   */
  async performIncrementalSync(): Promise<SyncStats> {
    if (this.isRunning) {
      this.logger.warn('Sync is already running, skipping incremental sync');
      return null;
    }

    this.isRunning = true;
    const stats: SyncStats = {
      totalKiotVietCustomers: 0,
      totalLarkRecords: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: 0,
      startTime: new Date(),
    };

    try {
      // Nếu chưa có full sync, thì chạy full sync
      if (!this.lastFullSyncDate) {
        this.logger.log(
          'No previous full sync found, performing full sync instead',
        );
        return await this.performFullSync();
      }

      this.logger.log('Starting incremental sync from KiotViet to Lark Base');

      // Get customers modified since last sync
      const lastSyncISO = this.lastFullSyncDate.toISOString();
      const modifiedCustomers =
        await this.kiotVietService.getCustomersModifiedAfter(lastSyncISO);
      stats.totalKiotVietCustomers = modifiedCustomers.length;

      if (modifiedCustomers.length === 0) {
        this.logger.log('No customers modified since last sync');
        stats.endTime = new Date();
        return stats;
      }

      this.logger.log(
        `Found ${modifiedCustomers.length} modified customers since ${lastSyncISO}`,
      );

      // Process each modified customer
      for (const customer of modifiedCustomers) {
        try {
          const existingMapping = this.customerMappings.get(customer.code);

          if (existingMapping) {
            // Update existing record
            const updateResult = await this.larkService.batchUpdateRecords([
              {
                recordId: existingMapping.recordId,
                customer: customer,
              },
            ]);

            if (updateResult.length > 0) {
              stats.updated++;
              existingMapping.lastSyncDate = new Date();
            }
          } else {
            // Create new record
            const createResult = await this.larkService.batchCreateRecords([
              customer,
            ]);

            if (createResult.length > 0) {
              stats.created++;
              this.customerMappings.set(customer.code, {
                customerCode: customer.code,
                recordId: createResult[0].record_id,
                lastSyncDate: new Date(),
              });
            }
          }
        } catch (error) {
          this.logger.error(
            `Error syncing customer ${customer.code}:`,
            error.message,
          );
          stats.errors++;
        }
      }

      this.lastFullSyncDate = new Date(); // Update last sync time
      stats.endTime = new Date();
      stats.duration = this.formatDuration(stats.startTime, stats.endTime);

      this.logger.log(
        `Incremental sync completed: Created ${stats.created}, Updated ${stats.updated}, Errors ${stats.errors}`,
      );

      return stats;
    } catch (error) {
      stats.endTime = new Date();
      stats.duration = this.formatDuration(stats.startTime, stats.endTime);
      stats.errors++;

      this.logger.error('Incremental sync failed:', error.message);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Handle KiotViet webhook for real-time updates
   */
  async handleCustomerWebhook(webhookData: any): Promise<void> {
    try {
      this.logger.log('Processing KiotViet customer webhook');

      const { Action, Data } = webhookData.Notifications?.[0] || {};

      if (!Data || !Array.isArray(Data)) {
        this.logger.warn('Invalid webhook data format');
        return;
      }

      for (const customer of Data as KiotVietCustomer[]) {
        try {
          if (Action === 'create' || Action === 'update') {
            await this.syncSingleCustomer(customer);
          } else if (Action === 'delete') {
            await this.deleteSingleCustomer(customer.code);
          }
        } catch (error) {
          this.logger.error(
            `Error processing webhook for customer ${customer.code}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error processing customer webhook:', error.message);
      throw error;
    }
  }

  /**
   * Sync a single customer
   */
  private async syncSingleCustomer(customer: KiotVietCustomer): Promise<void> {
    const existingMapping = this.customerMappings.get(customer.code);

    if (existingMapping) {
      // Update existing record
      await this.larkService.batchUpdateRecords([
        {
          recordId: existingMapping.recordId,
          customer: customer,
        },
      ]);

      existingMapping.lastSyncDate = new Date();
      this.logger.log(`Updated customer ${customer.code} in Lark Base`);
    } else {
      // Create new record
      const createResult = await this.larkService.batchCreateRecords([
        customer,
      ]);

      if (createResult.length > 0) {
        this.customerMappings.set(customer.code, {
          customerCode: customer.code,
          recordId: createResult[0].record_id,
          lastSyncDate: new Date(),
        });
        this.logger.log(`Created new customer ${customer.code} in Lark Base`);
      }
    }
  }

  /**
   * Delete a single customer
   */
  private async deleteSingleCustomer(customerCode: string): Promise<void> {
    const mapping = this.customerMappings.get(customerCode);

    if (mapping) {
      await this.larkService.batchDeleteRecords([mapping.recordId]);
      this.customerMappings.delete(customerCode);
      this.logger.log(`Deleted customer ${customerCode} from Lark Base`);
    }
  }

  /**
   * Build customer mappings from existing Lark records
   */
  private async buildCustomerMappings(
    larkRecords: LarkRecord[],
  ): Promise<void> {
    this.customerMappings.clear();

    for (const record of larkRecords) {
      const customerCode = record.fields['fldW0iwzXc']; // Mã Khách Hàng field
      if (customerCode && record.record_id) {
        this.customerMappings.set(customerCode, {
          customerCode,
          recordId: record.record_id,
          lastSyncDate: new Date(),
        });
      }
    }

    this.logger.log(
      `Built mappings for ${this.customerMappings.size} existing customers`,
    );
  }

  /**
   * Analyze changes between KiotViet and Lark data
   */
  private async analyzeChanges(
    kiotVietCustomers: KiotVietCustomer[],
    larkRecords: LarkRecord[],
  ) {
    const toCreate: KiotVietCustomer[] = [];
    const toUpdate: Array<{ recordId: string; customer: KiotVietCustomer }> =
      [];
    const toDelete: string[] = [];

    // Find customers to create or update
    for (const customer of kiotVietCustomers) {
      const mapping = this.customerMappings.get(customer.code);

      if (mapping) {
        // Customer exists, check if needs update
        toUpdate.push({
          recordId: mapping.recordId,
          customer: customer,
        });
      } else {
        // New customer
        toCreate.push(customer);
      }
    }

    // Find records to delete (records in Lark but not in KiotViet)
    const kiotVietCodes = new Set(kiotVietCustomers.map((c) => c.code));

    for (const record of larkRecords) {
      const customerCode = record.fields['fldW0iwzXc'];
      if (
        customerCode &&
        !kiotVietCodes.has(customerCode) &&
        record.record_id
      ) {
        toDelete.push(record.record_id);
      }
    }

    return { toCreate, toUpdate, toDelete };
  }

  /**
   * 🔄 SCHEDULED JOB: Tự động chạy incremental sync mỗi 30 phút
   * Không cần gọi API, tự động chạy background
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledIncrementalSync(): Promise<void> {
    if (!this.isInitialized) {
      this.logger.log('⏳ System not yet initialized, skipping scheduled sync');
      return;
    }

    try {
      this.logger.log(
        '⏰ SCHEDULED INCREMENTAL SYNC: Starting automated sync...',
      );
      const stats = await this.performIncrementalSync();

      if (stats && (stats.created > 0 || stats.updated > 0)) {
        this.logger.log(
          `✅ Scheduled sync completed: ${stats.created} created, ${stats.updated} updated`,
        );
      } else {
        this.logger.log('✅ Scheduled sync completed: No changes detected');
      }
    } catch (error) {
      this.logger.error('❌ Scheduled incremental sync failed:', error.message);
    }
  }

  /**
   * 🌙 SCHEDULED JOB: Tự động chạy full sync mỗi ngày lúc 2:00 AM
   * Đảm bảo data luôn đồng bộ hoàn toàn
   */
  @Cron('0 2 * * *') // Chạy lúc 2:00 AM mỗi ngày
  async scheduledFullSync(): Promise<void> {
    if (!this.isInitialized) {
      this.logger.log(
        '⏳ System not yet initialized, skipping scheduled full sync',
      );
      return;
    }

    try {
      this.logger.log(
        '🌙 SCHEDULED FULL SYNC: Starting daily full synchronization...',
      );
      const stats = await this.performFullSync();
      this.logger.log(
        `✅ Daily full sync completed: Created ${stats.created}, Updated ${stats.updated}, Deleted ${stats.deleted}`,
      );
    } catch (error) {
      this.logger.error('❌ Scheduled full sync failed:', error.message);
    }
  }

  /**
   * 📊 SCHEDULED JOB: Báo cáo trạng thái hệ thống mỗi giờ
   */
  @Cron('0 * * * *') // Chạy mỗi giờ
  async scheduledStatusReport(): Promise<void> {
    if (!this.isInitialized) return;

    const status = this.getSyncStatus();
    this.logger.log(
      `📊 SYSTEM STATUS: Running: ${status.isRunning}, Mappings: ${status.totalMappings}, Last Sync: ${status.lastFullSyncDate || 'Never'}`,
    );
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      isRunning: this.isRunning,
      lastFullSyncDate: this.lastFullSyncDate,
      totalMappings: this.customerMappings.size,
    };
  }

  private formatDuration(start: Date, end: Date): string {
    const diffMs = end.getTime() - start.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffSeconds = Math.floor((diffMs % 60000) / 1000);
    return `${diffMinutes}m ${diffSeconds}s`;
  }
}
