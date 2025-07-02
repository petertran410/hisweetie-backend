export interface SyncResult {
  success: boolean;
  totalSynced: number;
  totalUpdated: number;
  totalDeleted: number;
  errors: string[];
  summary: {
    beforeSync: number;
    afterSync: number;
    newRecords: number;
    updatedRecords: number;
    skippedRecords: number;
  };
}

export interface FullSyncResult {
  success: boolean;
  errors: string[];
  trademarks: SyncResult;
  categories: SyncResult;
  products: SyncResult;
}

export interface ValidationResult {
  canSyncProducts: boolean;
  categoriesCount: number;
  trademarksCount: number;
  recommendations: string[];
}

export interface SyncOrderStep {
  step: number;
  name: string;
  dependencies: string[];
}

export interface ProductFetchResult {
  products: KiotVietProduct[];
  totalFetched: number;
}

// Re-export interfaces from other type files
export interface KiotVietProduct {
  id: number;
  code: string;
  name: string;
  categoryId?: number;
  categoryName?: string;
  tradeMarkId?: number;
  tradeMarkName?: string;
  basePrice?: number;
  images?: Array<{ Image: string }> | string[];
  type?: number; // 1=combo, 2=normal, 3=service
  modifiedDate?: string;
  createdDate?: string;
  allowsSale?: boolean;
}

export interface KiotVietCategory {
  categoryId: number;
  categoryName: string;
  parentId?: number;
  hasChild?: boolean;
  rank?: number;
  retailerId?: number;
  createdDate?: string;
  modifiedDate?: string;
}

export interface KiotVietTrademark {
  tradeMarkId: number;
  tradeMarkName: string;
  createdDate?: string;
  modifiedDate?: string;
}

export interface KiotVietCredentials {
  retailerName: string;
  clientId: string;
  clientSecret: string;
}

export interface KiotVietTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface StoredToken {
  accessToken: string;
  expiresAt: Date;
  tokenType: string;
}
