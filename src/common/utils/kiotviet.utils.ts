// Create this file: src/common/utils/kiotviet.utils.ts
import { Logger } from '@nestjs/common';

export class KiotVietUtils {
  private static readonly logger = new Logger(KiotVietUtils.name);

  /**
   * Validate KiotViet credentials format
   */
  static validateCredentials(credentials: {
    retailerName?: string;
    clientId?: string;
    clientSecret?: string;
  }): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!credentials.retailerName || credentials.retailerName.trim() === '') {
      errors.push('Retailer name is required');
    }

    if (!credentials.clientId || credentials.clientId.trim() === '') {
      errors.push('Client ID is required');
    } else if (credentials.clientId.length < 10) {
      errors.push('Client ID appears to be too short');
    }

    if (!credentials.clientSecret || credentials.clientSecret.trim() === '') {
      errors.push('Client secret is required');
    } else if (credentials.clientSecret.length < 20) {
      errors.push('Client secret appears to be too short');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse category names from string
   */
  static parseCategoryNames(categoriesString?: string): string[] {
    if (!categoriesString || categoriesString.trim() === '') {
      return [];
    }

    return categoriesString
      .split(',')
      .map((cat) => cat.trim())
      .filter((cat) => cat.length > 0)
      .filter((cat, index, arr) => arr.indexOf(cat) === index); // Remove duplicates
  }

  /**
   * Parse category IDs from string
   */
  static parseCategoryIds(categoryIdsString?: string): number[] {
    if (!categoryIdsString || categoryIdsString.trim() === '') {
      return [];
    }

    return categoryIdsString
      .split(',')
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id) && id > 0)
      .filter((id, index, arr) => arr.indexOf(id) === index); // Remove duplicates
  }

  /**
   * Format sync result for API response
   */
  static formatSyncResult(result: any, operation: string): any {
    const formatted = {
      operation,
      success: result.success,
      timestamp: new Date().toISOString(),
      summary: {
        totalProcessed: result.totalSynced || 0,
        totalDeleted: result.totalDeleted || 0,
        newItems:
          result.summary?.newProducts || result.summary?.newCategories || 0,
        updatedItems:
          result.summary?.updatedProducts ||
          result.summary?.updatedCategories ||
          0,
        beforeSync: result.summary?.beforeSync || 0,
        afterSync: result.summary?.afterSync || 0,
      },
      performance: {
        totalBatches: result.batchInfo?.length || 0,
        averageBatchSize:
          result.batchInfo?.length > 0
            ? Math.round(
                result.batchInfo.reduce(
                  (sum: number, batch: any) => sum + batch.itemsFetched,
                  0,
                ) / result.batchInfo.length,
              )
            : 0,
      },
      errors: result.errors || [],
      errorCount: (result.errors || []).length,
    };

    // Add category-specific info if available
    if (result.categoryInfo) {
      formatted['categoryInfo'] = result.categoryInfo;
    }

    // Add hierarchical structure info if available
    if (result.hierarchicalStructure) {
      formatted['hierarchicalStructure'] = result.hierarchicalStructure;
    }

    // Add cleanup info if available
    if (result.cleanupInfo) {
      formatted['cleanupInfo'] = result.cleanupInfo;
    }

    return formatted;
  }

  /**
   * Calculate estimated time for sync operation
   */
  static estimateSyncTime(
    itemCount: number,
    avgItemsPerSecond: number = 10,
  ): {
    estimatedSeconds: number;
    estimatedMinutes: number;
    humanReadable: string;
  } {
    const estimatedSeconds = Math.ceil(itemCount / avgItemsPerSecond);
    const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

    let humanReadable: string;
    if (estimatedSeconds < 60) {
      humanReadable = `${estimatedSeconds} seconds`;
    } else if (estimatedMinutes < 60) {
      humanReadable = `${estimatedMinutes} minute${estimatedMinutes > 1 ? 's' : ''}`;
    } else {
      const hours = Math.ceil(estimatedMinutes / 60);
      humanReadable = `${hours} hour${hours > 1 ? 's' : ''}`;
    }

    return {
      estimatedSeconds,
      estimatedMinutes,
      humanReadable,
    };
  }

  /**
   * Validate date string for incremental sync
   */
  static validateSyncDate(dateString?: string): {
    isValid: boolean;
    date?: Date;
    error?: string;
  } {
    if (!dateString) {
      return { isValid: true }; // Optional parameter
    }

    try {
      const date = new Date(dateString);

      if (isNaN(date.getTime())) {
        return { isValid: false, error: 'Invalid date format' };
      }

      if (date > new Date()) {
        return { isValid: false, error: 'Date cannot be in the future' };
      }

      // Check if date is too old (more than 1 year ago)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      if (date < oneYearAgo) {
        this.logger.warn(`Sync date is more than 1 year old: ${dateString}`);
      }

      return { isValid: true, date };
    } catch (error) {
      return { isValid: false, error: `Date parsing error: ${error.message}` };
    }
  }

  /**
   * Generate sync operation ID for tracking
   */
  static generateSyncId(operation: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '');
    const random = Math.random().toString(36).substring(2, 8);
    return `${operation}_${timestamp}_${random}`;
  }

  /**
   * Calculate data transfer size estimation
   */
  static estimateDataSize(
    itemCount: number,
    avgItemSizeKB: number = 2,
  ): {
    totalKB: number;
    totalMB: number;
    humanReadable: string;
  } {
    const totalKB = itemCount * avgItemSizeKB;
    const totalMB = totalKB / 1024;

    let humanReadable: string;
    if (totalKB < 1024) {
      humanReadable = `${Math.round(totalKB)} KB`;
    } else if (totalMB < 1024) {
      humanReadable = `${Math.round(totalMB * 100) / 100} MB`;
    } else {
      const totalGB = totalMB / 1024;
      humanReadable = `${Math.round(totalGB * 100) / 100} GB`;
    }

    return {
      totalKB: Math.round(totalKB),
      totalMB: Math.round(totalMB * 100) / 100,
      humanReadable,
    };
  }
}
