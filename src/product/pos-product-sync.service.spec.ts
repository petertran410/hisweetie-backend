/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { PosProductSyncService } from './pos-product-sync.service';

const createService = () => {
  const httpService = {
    post: jest.fn(() =>
      of({
        data: {
          access_token: 'pos-access-token',
          expires_in: 3600,
        },
      }),
    ),
    get: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        POS_PUBLIC_API_BASE_URL:
          'https://backendpos.hisweetievietnam.com/api/public/v1',
        POS_PUBLIC_API_CLIENT_ID: 'cms-client',
        POS_PUBLIC_API_CLIENT_SECRET: 'cms-secret',
      };
      return values[key];
    }),
  };

  const prisma = {
    pos_product_sync_state: {
      upsert: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  return {
    service: new PosProductSyncService(
      httpService as never,
      configService as never,
      prisma as never,
    ),
    httpService,
    prisma,
  };
};

const validPriceBookResponse = {
  data: {
    id: 22,
    name: 'BẢNG GIÁ LẺ HCM',
    isActive: true,
    priceBookDetails: [
      {
        productId: 77,
        price: 125000,
        isActive: true,
      },
    ],
  },
  timestamp: '2026-09-18T00:00:00.000Z',
};

const validProductListResponse = {
  total: 1,
  pageSize: 100,
  currentItem: 0,
  data: [
    {
      id: 77,
      code: 'SP-001',
      name: 'Sản phẩm POS',
      isActive: true,
      updatedAt: '2026-09-18T00:00:00.000Z',
      images: [{ image: 'https://cdn.example.com/product.webp' }],
    },
  ],
  timestamp: '2026-09-18T00:00:00.000Z',
};

describe('PosProductSyncService', () => {
  it('only updates POS fields for a product mapped by the exact POS code', async () => {
    const { service, httpService, prisma } = createService();

    httpService.get
      .mockReturnValueOnce(of({ data: validPriceBookResponse }))
      .mockReturnValueOnce(of({ data: validProductListResponse }));
    prisma.product.findUnique.mockImplementation(({ where }: any) => {
      if (where.pos_code) {
        return Promise.resolve({
          id: BigInt(1),
          pos_code: 'SP-001',
          pos_product_id: null,
          pos_price: null,
        });
      }
      return Promise.resolve(null);
    });

    const result = await service.syncProducts();

    expect(result.status).toBe('SUCCESS');
    expect(result.summary).toMatchObject({
      fetched: 1,
      matched: 1,
      updated: 1,
      pricesUpdated: 1,
      created: 0,
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: BigInt(1) },
      data: expect.objectContaining({
        pos_product_id: 77,
        pos_code: 'SP-001',
        pos_name: 'Sản phẩm POS',
        pos_price: expect.anything(),
      }),
    });
    expect(prisma.product.update.mock.calls[0][0].data).not.toHaveProperty(
      'kiotviet_price',
    );
    expect(prisma.product.update.mock.calls[0][0].data).not.toHaveProperty(
      'title',
    );
  });

  it('creates hidden configurations for both sites when a POS product is new', async () => {
    const { service, httpService, prisma } = createService();
    const tx = {
      product: {
        create: jest.fn().mockResolvedValue({ id: BigInt(99) }),
      },
      product_site_config: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    httpService.get
      .mockReturnValueOnce(of({ data: validPriceBookResponse }))
      .mockReturnValueOnce(of({ data: validProductListResponse }));
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    const result = await service.syncProducts();

    expect(result.summary.created).toBe(1);
    expect(tx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pos_product_id: 77,
        pos_code: 'SP-001',
        pos_name: 'Sản phẩm POS',
      }),
    });
    expect(tx.product_site_config.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ site_code: 'dieptra', is_visible: false }),
        expect.objectContaining({ site_code: 'lermao', is_visible: false }),
      ]),
    });
  });

  it('fails before writing products when pricebook 22 has the wrong name', async () => {
    const { service, httpService, prisma } = createService();

    httpService.get.mockReturnValueOnce(
      of({
        data: {
          ...validPriceBookResponse,
          data: {
            ...validPriceBookResponse.data,
            name: 'BẢNG GIÁ KHÁC',
          },
        },
      }),
    );

    await expect(service.syncProducts()).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('rejects a second sync while the existing POS sync lock is active', async () => {
    const { service, prisma } = createService();
    prisma.pos_product_sync_state.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.syncProducts()).rejects.toThrow(
      'POS product synchronization is already running',
    );
  });
});
