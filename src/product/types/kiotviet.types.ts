// src/product/types/kiotviet.types.ts - CREATE THIS NEW FILE
// This will solve the interface visibility issues

export interface KiotVietCategory {
  categoryId: number;
  categoryName: string;
  parentId?: number;
  retailerId?: number; // FIXED: Make optional to match API
  createdDate?: string;
  modifiedDate?: string;
  hasChild?: boolean;
  children?: KiotVietCategory[];
  rank?: number;
}

export interface KiotVietTrademark {
  tradeMarkId: number;
  tradeMarkName: string;
  createdDate?: string;
  modifiedDate?: string;
}

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
  type?: number;
  modifiedDate?: string;
  createdDate?: string;
  allowsSale?: boolean;
}

export interface KiotVietCategoryResponse {
  total: number;
  pageSize: number;
  data: KiotVietCategory[];
  timestamp: string;
}

export interface KiotVietApiResponse {
  total: number;
  pageSize: number;
  data: KiotVietProduct[];
  removeId?: number[];
}

export interface CategorySyncResult {
  success: boolean;
  totalSynced: number;
  totalDeleted: number;
  errors: string[];
  summary: {
    beforeSync: number;
    afterSync: number;
    newCategories: number;
    updatedCategories: number;
    deletedCategories: number;
  };
  hierarchicalStructure: {
    totalRootCategories: number;
    totalChildCategories: number;
    maxDepth: number;
  };
}

export interface SyncResult {
  success: boolean;
  totalSynced: number;
  totalDeleted: number;
  errors: string[];
  summary: {
    beforeSync: number;
    afterSync: number;
    newProducts: number;
    updatedProducts: number;
    deletedProducts: number;
  };
  batchInfo: Array<{
    batchNumber: number;
    itemsFetched: number;
    currentItem: number;
  }>;
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

export interface KiotVietCredentials {
  retailerName: string;
  clientId: string;
  clientSecret: string;
}
