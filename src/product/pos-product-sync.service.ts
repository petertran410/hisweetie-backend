import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

const POS_PRODUCT_SYNC_SOURCE = 'pos-products';
const POS_PRICE_BOOK_ID = 22;
const POS_PRICE_BOOK_NAME = 'BẢNG GIÁ LẺ HCM';
const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 800;
const LOCK_DURATION_MS = 30 * 60 * 1000;

type SyncStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

interface PosOAuthResponse {
  access_token: string;
  expires_in: number;
}

interface PosProductImage {
  image?: string;
}

interface PosProduct {
  id: number;
  code: string;
  name: string;
  isActive?: boolean;
  updatedAt?: string;
  images?: PosProductImage[];
}

interface PosProductListResponse {
  total: number;
  pageSize: number;
  currentItem: number;
  data: PosProduct[];
  timestamp: string;
}

interface PosPriceBookDetail {
  productId: number;
  price: number;
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

interface PosPriceBook {
  id: number;
  name: string;
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  priceBookDetails?: PosPriceBookDetail[];
}

interface PosPriceBookResponse {
  data: PosPriceBook;
  timestamp: string;
}

export interface PosProductSyncSummary {
  fetched: number;
  matched: number;
  created: number;
  updated: number;
  pricesUpdated: number;
  skipped: number;
  conflicts: number;
  failed: number;
  errors: string[];
}

@Injectable()
export class PosProductSyncService {
  private readonly logger = new Logger(PosProductSyncService.name);
  private accessToken?: { value: string; expiresAt: Date };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async syncProducts() {
    await this.acquireLock();

    const startedAt = new Date();
    const summary: PosProductSyncSummary = {
      fetched: 0,
      matched: 0,
      created: 0,
      updated: 0,
      pricesUpdated: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      errors: [],
    };

    try {
      const priceBook = await this.fetchPriceBook();
      const priceByProductId = this.buildPriceMap(priceBook);
      const { products, syncUntil } = await this.fetchAllProducts();

      summary.fetched = products.length;

      for (const product of products) {
        await this.syncProduct(product, priceByProductId, summary);
      }

      const status: SyncStatus =
        summary.conflicts > 0 || summary.failed > 0 ? 'PARTIAL' : 'SUCCESS';
      const completedAt = new Date();

      await this.completeSync(status, summary, completedAt, null);

      return {
        success: status === 'SUCCESS',
        status,
        source: 'POS',
        priceBook: {
          id: POS_PRICE_BOOK_ID,
          name: POS_PRICE_BOOK_NAME,
        },
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        syncUntil,
        summary,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      const completedAt = new Date();

      this.logger.error(`POS product sync failed: ${message}`);
      await this.completeSync('FAILED', summary, completedAt, message);

      throw error;
    }
  }

  async getStatus() {
    const [state, totalProducts, mappedProducts, pricedProducts] =
      await Promise.all([
        this.prisma.pos_product_sync_state.findUnique({
          where: { source: POS_PRODUCT_SYNC_SOURCE },
        }),
        this.prisma.product.count(),
        this.prisma.product.count({
          where: { pos_code: { not: null } },
        }),
        this.prisma.product.count({
          where: { pos_price: { not: null } },
        }),
      ]);

    return {
      source: 'POS',
      status: state?.status || 'IDLE',
      isRunning: state?.status === 'RUNNING',
      priceBook: {
        id: POS_PRICE_BOOK_ID,
        name: POS_PRICE_BOOK_NAME,
      },
      lastSync: state?.last_successful_at || null,
      startedAt: state?.started_at || null,
      completedAt: state?.completed_at || null,
      errorMessage: state?.error_message || null,
      summary: state?.summary || null,
      totalProducts,
      mappedProducts,
      pricedProducts,
    };
  }

  private async syncProduct(
    posProduct: PosProduct,
    priceByProductId: Map<number, number>,
    summary: PosProductSyncSummary,
  ) {
    const code = posProduct.code?.trim();

    if (!code) {
      summary.skipped++;
      summary.errors.push(
        `POS product ${posProduct.id} was skipped because its code is empty`,
      );
      return;
    }

    if (!Number.isInteger(posProduct.id) || posProduct.id <= 0) {
      summary.skipped++;
      summary.errors.push(
        `POS product "${code}" was skipped because its ID is invalid`,
      );
      return;
    }

    const posPrice = priceByProductId.get(posProduct.id) ?? null;

    try {
      const [productByCode, productByPosId] = await Promise.all([
        this.prisma.product.findUnique({
          where: { pos_code: code },
          select: {
            id: true,
            pos_code: true,
            pos_product_id: true,
            pos_price: true,
          },
        }),
        this.prisma.product.findUnique({
          where: { pos_product_id: posProduct.id },
          select: {
            id: true,
            pos_code: true,
            pos_product_id: true,
          },
        }),
      ]);

      if (productByCode && productByCode.pos_code !== code) {
        this.recordConflict(
          summary,
          `POS code "${code}" does not exactly match stored code "${productByCode.pos_code}"`,
        );
        return;
      }

      if (
        productByCode &&
        productByPosId &&
        productByCode.id !== productByPosId.id
      ) {
        this.recordConflict(
          summary,
          `POS code "${code}" and POS ID ${posProduct.id} point to different website products`,
        );
        return;
      }

      if (
        productByCode &&
        productByCode.pos_product_id !== null &&
        productByCode.pos_product_id !== posProduct.id
      ) {
        this.recordConflict(
          summary,
          `Product mapped by POS code "${code}" already belongs to POS ID ${productByCode.pos_product_id}`,
        );
        return;
      }

      if (!productByCode && productByPosId) {
        this.recordConflict(
          summary,
          `POS ID ${posProduct.id} is already mapped to code "${productByPosId.pos_code}", not "${code}"`,
        );
        return;
      }

      const data = this.toPosProductData(posProduct, posPrice);

      if (productByCode) {
        await this.prisma.product.update({
          where: { id: productByCode.id },
          data,
        });

        summary.matched++;
        summary.updated++;
        if (this.priceChanged(productByCode.pos_price, posPrice)) {
          summary.pricesUpdated++;
        }
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        const createdProduct = await tx.product.create({ data });

        await tx.product_site_config.createMany({
          data: ['dieptra', 'lermao'].map((siteCode) => ({
            product_id: createdProduct.id,
            site_code: siteCode,
            is_visible: false,
            is_featured: false,
            price_on: false,
          })),
        });
      });

      summary.created++;
      if (posPrice !== null) {
        summary.pricesUpdated++;
      }
    } catch (error) {
      summary.failed++;
      const message = `Failed to sync POS product "${code}": ${this.errorMessage(error)}`;
      summary.errors.push(message);
      this.logger.error(message);
    }
  }

  private async fetchPriceBook(): Promise<PosPriceBook> {
    const response = await this.request<PosPriceBookResponse>(
      'GET',
      `/price-books/${POS_PRICE_BOOK_ID}`,
      { params: { include: 'details' } },
    );
    const priceBook = response.data;

    if (!priceBook) {
      throw new BadRequestException(
        `POS pricebook ${POS_PRICE_BOOK_ID} was not returned`,
      );
    }

    if (
      Number(priceBook.id) !== POS_PRICE_BOOK_ID ||
      priceBook.name !== POS_PRICE_BOOK_NAME
    ) {
      throw new BadRequestException(
        `POS pricebook validation failed. Expected ${POS_PRICE_BOOK_ID} "${POS_PRICE_BOOK_NAME}"`,
      );
    }

    if (!this.isActiveAndEffective(priceBook)) {
      throw new BadRequestException(
        `POS pricebook ${POS_PRICE_BOOK_ID} "${POS_PRICE_BOOK_NAME}" is inactive or outside its effective date range`,
      );
    }

    if (!Array.isArray(priceBook.priceBookDetails)) {
      throw new BadRequestException(
        `POS pricebook ${POS_PRICE_BOOK_ID} did not include priceBookDetails`,
      );
    }

    return priceBook;
  }

  private buildPriceMap(priceBook: PosPriceBook) {
    const prices = new Map<number, number>();

    for (const detail of priceBook.priceBookDetails || []) {
      if (
        !Number.isInteger(Number(detail.productId)) ||
        !Number.isFinite(Number(detail.price)) ||
        !this.isActiveAndEffective(detail)
      ) {
        continue;
      }

      prices.set(Number(detail.productId), Number(detail.price));
    }

    return prices;
  }

  private async fetchAllProducts() {
    const products: PosProduct[] = [];
    let currentItem = 0;
    let syncUntil: string | undefined;

    while (true) {
      const params: Record<string, string | number | boolean> = {
        pageSize: PAGE_SIZE,
        currentItem,
        includeInactive: true,
        include: 'images',
        orderBy: 'updatedAt',
        orderDirection: 'asc',
      };

      if (syncUntil) {
        params.lastModifiedTo = syncUntil;
      }

      const response = await this.request<PosProductListResponse>(
        'GET',
        '/products',
        { params },
      );

      if (!syncUntil) {
        if (!response.timestamp) {
          throw new BadRequestException(
            'POS product response did not include a synchronization timestamp',
          );
        }
        syncUntil = response.timestamp;
      }

      const page = Array.isArray(response.data) ? response.data : [];
      products.push(...page);
      currentItem += page.length;

      if (page.length === 0 || currentItem >= response.total) {
        break;
      }

      await this.sleep(PAGE_DELAY_MS);
    }

    return { products, syncUntil: syncUntil || null };
  }

  private toPosProductData(
    product: PosProduct,
    price: number | null,
  ): Prisma.productUncheckedCreateInput {
    const updatedAt = this.toDateOrNull(product.updatedAt);
    const images = this.normalizeImages(product.images);

    return {
      pos_product_id: product.id,
      pos_code: product.code.trim(),
      pos_name: product.name?.trim() || null,
      pos_images: images.length ? images : Prisma.JsonNull,
      pos_price: price === null ? null : new Prisma.Decimal(price),
      pos_is_active:
        typeof product.isActive === 'boolean' ? product.isActive : null,
      pos_updated_at: updatedAt,
      pos_synced_at: new Date(),
    };
  }

  private normalizeImages(images?: PosProductImage[]) {
    if (!Array.isArray(images)) {
      return [];
    }

    return images
      .map((image) => image?.image?.trim())
      .filter((image): image is string => Boolean(image));
  }

  private isActiveAndEffective(data: {
    isActive?: boolean;
    startDate?: string | null;
    endDate?: string | null;
  }) {
    if (data.isActive === false) {
      return false;
    }

    const now = Date.now();
    const startDate = this.toDateOrNull(data.startDate);
    const endDate = this.toDateOrNull(data.endDate);

    return (
      (!startDate || startDate.getTime() <= now) &&
      (!endDate || endDate.getTime() >= now)
    );
  }

  private toDateOrNull(value?: string | null) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private priceChanged(
    currentPrice: Prisma.Decimal | null,
    nextPrice: number | null,
  ) {
    const current = currentPrice ? Number(currentPrice) : null;
    return current !== nextPrice;
  }

  private recordConflict(summary: PosProductSyncSummary, message: string) {
    summary.conflicts++;
    summary.errors.push(message);
    this.logger.warn(message);
  }

  private async acquireLock() {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);

    await this.prisma.pos_product_sync_state.upsert({
      where: { source: POS_PRODUCT_SYNC_SOURCE },
      update: {},
      create: {
        source: POS_PRODUCT_SYNC_SOURCE,
        status: 'IDLE',
      },
    });

    const lockResult = await this.prisma.pos_product_sync_state.updateMany({
      where: {
        source: POS_PRODUCT_SYNC_SOURCE,
        OR: [
          { status: { not: 'RUNNING' } },
          { locked_until: { lt: now } },
          { locked_until: null },
        ],
      },
      data: {
        status: 'RUNNING',
        started_at: now,
        completed_at: null,
        locked_until: lockedUntil,
        summary: Prisma.JsonNull,
        error_message: null,
      },
    });

    if (lockResult.count !== 1) {
      throw new ConflictException(
        'POS product synchronization is already running',
      );
    }
  }

  private async completeSync(
    status: SyncStatus,
    summary: PosProductSyncSummary,
    completedAt: Date,
    errorMessage: string | null,
  ) {
    await this.prisma.pos_product_sync_state.update({
      where: { source: POS_PRODUCT_SYNC_SOURCE },
      data: {
        status,
        completed_at: completedAt,
        last_successful_at: status === 'SUCCESS' ? completedAt : undefined,
        locked_until: null,
        summary: summary as unknown as Prisma.InputJsonValue,
        error_message: errorMessage,
      },
    });
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: {
      params?: Record<string, string | number | boolean>;
      data?: Record<string, string>;
    } = {},
    forceTokenRefresh = false,
  ): Promise<T> {
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const token = await this.getAccessToken(forceTokenRefresh);
        const config = {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          params: options.params,
          timeout: 45000,
        };

        const response =
          method === 'GET'
            ? await firstValueFrom(
                this.httpService.get<T>(`${this.getBaseUrl()}${path}`, config),
              )
            : await firstValueFrom(
                this.httpService.post<T>(
                  `${this.getBaseUrl()}${path}`,
                  options.data || {},
                  config,
                ),
              );

        return response.data;
      } catch (error) {
        const status = isAxiosError(error) ? error.response?.status : undefined;

        if (status === 401 && attempt === 0) {
          this.accessToken = undefined;
          forceTokenRefresh = true;
          continue;
        }

        if (
          attempt < maxRetries &&
          (status === 429 || (status !== undefined && status >= 500))
        ) {
          await this.sleep(this.retryDelay(error, attempt));
          continue;
        }

        throw new BadRequestException(
          `POS request ${method} ${path} failed: ${this.errorMessage(error)}`,
        );
      }
    }

    throw new BadRequestException(
      `POS request ${method} ${path} exceeded retry limit`,
    );
  }

  private async getAccessToken(forceRefresh = false) {
    if (
      !forceRefresh &&
      this.accessToken &&
      this.accessToken.expiresAt.getTime() > Date.now()
    ) {
      return this.accessToken.value;
    }

    const clientId = this.configService.get<string>('POS_PUBLIC_API_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'POS_PUBLIC_API_CLIENT_SECRET',
    );

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'POS_PUBLIC_API_CLIENT_ID and POS_PUBLIC_API_CLIENT_SECRET must be configured',
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<PosOAuthResponse>(
          `${this.getBaseUrl()}/oauth/token`,
          {
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
          },
        ),
      );
      const token = response.data;

      if (!token?.access_token || !Number.isFinite(Number(token.expires_in))) {
        throw new BadRequestException(
          'POS OAuth response did not contain a valid access token',
        );
      }

      const expiresInSeconds = Math.max(Number(token.expires_in) - 60, 30);
      this.accessToken = {
        value: token.access_token,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      };

      return this.accessToken.value;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `POS OAuth token request failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private getBaseUrl() {
    const baseUrl = this.configService.get<string>('POS_PUBLIC_API_BASE_URL');

    if (!baseUrl) {
      throw new BadRequestException(
        'POS_PUBLIC_API_BASE_URL must be configured',
      );
    }

    return baseUrl.replace(/\/+$/, '');
  }

  private retryDelay(error: unknown, attempt: number) {
    const retryAfter: unknown = isAxiosError(error)
      ? error.response?.headers?.['retry-after']
      : undefined;
    const retryAfterSeconds = Number(retryAfter);

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000;
    }

    return 1000 * 2 ** attempt;
  }

  private errorMessage(error: unknown) {
    if (isAxiosError(error)) {
      const responseMessage = this.extractMessage(error.response?.data);
      return responseMessage || error.message || 'Unknown error';
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }

  private extractMessage(data: unknown): string | null {
    if (!data || typeof data !== 'object' || !('message' in data)) {
      return null;
    }

    const message = data.message;
    if (Array.isArray(message)) {
      return message
        .filter((item): item is string => typeof item === 'string')
        .join(', ');
    }

    return typeof message === 'string' ? message : null;
  }

  private async sleep(milliseconds: number) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
