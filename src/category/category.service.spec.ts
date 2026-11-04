/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { CategoryService } from './category.service';

// Cây: cha(1) → cu(2); moi(3) là danh mục gốc
const categoriesOf = (siteCode: string) => [
  { id: BigInt(1), slug: 'tra', parent_id: null, site_code: siteCode, name: 'Trà' },
  { id: BigInt(2), slug: 'tra-cu', parent_id: BigInt(1), site_code: siteCode, name: 'Trà cũ' },
  { id: BigInt(3), slug: 'tra-moi', parent_id: null, site_code: siteCode, name: 'Trà mới' },
];

const createService = (siteCodeOfData: string) => {
  const categories = categoriesOf(siteCodeOfData);
  const tx = {
    product: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    product_site_config: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    category: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    url_redirect: { upsert: jest.fn().mockResolvedValue({ id: BigInt(99) }) },
  };
  const prisma = {
    category: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(categories.find((c) => c.id === where.id) ?? null),
      ),
      findMany: jest.fn().mockResolvedValue(categories),
    },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  const revalidate = { revalidateSite: jest.fn() };

  const service = new CategoryService(prisma as never, revalidate as never);
  jest
    .spyOn(service as any, 'recalculateHierarchy')
    .mockResolvedValue(undefined);

  return { service, tx, revalidate };
};

describe('CategoryService.mergeCategory redirect path per site', () => {
  it('builds lermao category URLs under /nguyen-lieu-pha-che', async () => {
    const { service, tx, revalidate } = createService('lermao');

    const result = await service.mergeCategory(2, 3, 'lermao');

    expect(result.data.sourcePath).toBe('/nguyen-lieu-pha-che/tra/tra-cu');
    expect(result.data.targetPath).toBe('/nguyen-lieu-pha-che/tra-moi');
    expect(tx.url_redirect.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          site_code_source_path: {
            site_code: 'lermao',
            source_path: '/nguyen-lieu-pha-che/tra/tra-cu',
          },
        },
        create: expect.objectContaining({ site_code: 'lermao' }),
      }),
    );
    expect(revalidate.revalidateSite).toHaveBeenCalledWith('lermao');
  });

  it('keeps dieptra category URLs under /san-pham', async () => {
    const { service, tx } = createService('dieptra');

    const result = await service.mergeCategory(2, 3, 'dieptra');

    expect(result.data.sourcePath).toBe('/san-pham/tra/tra-cu');
    expect(result.data.targetPath).toBe('/san-pham/tra-moi');
    expect(tx.url_redirect.upsert.mock.calls[0][0].create.site_code).toBe(
      'dieptra',
    );
  });

  it('refuses to merge categories that belong to the other site', async () => {
    const { service, tx } = createService('dieptra');

    await expect(service.mergeCategory(2, 3, 'lermao')).rejects.toThrow(
      'Danh mục không thuộc site này',
    );
    expect(tx.url_redirect.upsert).not.toHaveBeenCalled();
  });
});
