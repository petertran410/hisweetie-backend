/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { ProductService } from './product.service';

const createService = () => {
  const configService = {
    get: jest.fn((key: string) =>
      key === 'KIOT_BASE_URL' ? 'https://kiot.example.com' : undefined,
    ),
  };
  const revalidate = {
    revalidateSite: jest.fn(),
  };
  const prisma = {
    product: { findUnique: jest.fn() },
    product_site_config: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const service = new ProductService(
    {} as never,
    configService as never,
    {} as never,
    {} as never,
    revalidate as never,
  );
  (service as any).prisma = prisma;

  return { service, prisma, revalidate };
};

const savedSiteConfig = {
  id: BigInt(10),
  product_id: BigInt(7),
  site_code: 'dieptra',
  category_id: null,
  category: null,
  slug: 'ten-moi',
  is_visible: true,
  is_featured: false,
  price_on: false,
};

describe('ProductService site config slug handling', () => {
  it('preserves the existing slug when title changes without an explicit slug', async () => {
    const { service, prisma, revalidate } = createService();
    const tx = {
      product_site_config: {
        upsert: jest
          .fn()
          .mockResolvedValue({ ...savedSiteConfig, slug: 'ten-cu' }),
      },
      url_redirect: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    prisma.product.findUnique.mockResolvedValue({
      id: BigInt(7),
      title: 'Tên cũ',
      pos_name: null,
      kiotviet_name: null,
    });
    prisma.product_site_config.findUnique.mockResolvedValue({
      id: BigInt(10),
      slug: 'ten-cu',
    });
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await service.upsertProductSiteConfig(7, 'dieptra', {
      title: 'Tên mới',
    });

    expect(tx.product_site_config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ slug: 'ten-cu' }),
      }),
    );
    expect(
      tx.product_site_config.upsert.mock.calls[0][0].update,
    ).not.toHaveProperty('is_visible');
    expect(tx.url_redirect.upsert).not.toHaveBeenCalled();
    expect(revalidate.revalidateSite).toHaveBeenCalledWith('dieptra');
  });

  it('creates a 301 redirect only when the slug is explicitly changed', async () => {
    const { service, prisma, revalidate } = createService();
    const tx = {
      product_site_config: {
        upsert: jest.fn().mockResolvedValue(savedSiteConfig),
      },
      url_redirect: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: BigInt(99) }),
      },
    };

    prisma.product.findUnique.mockResolvedValue({
      id: BigInt(7),
      title: 'Tên cũ',
      pos_name: null,
      kiotviet_name: null,
    });
    prisma.product_site_config.findUnique.mockResolvedValue({
      id: BigInt(10),
      slug: 'ten-cu',
    });
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await service.upsertProductSiteConfig(7, 'dieptra', {
      title: 'Tên mới',
      slug: 'Tên mới',
      is_visible: true,
    });

    expect(tx.url_redirect.upsert).toHaveBeenCalledWith({
      where: {
        site_code_source_path: {
          site_code: 'dieptra',
          source_path: '/san-pham/diep-tra/ten-cu',
        },
      },
      update: expect.objectContaining({
        target_path: '/san-pham/diep-tra/ten-moi',
        status_code: 301,
      }),
      create: expect.objectContaining({
        source_path: '/san-pham/diep-tra/ten-cu',
        target_path: '/san-pham/diep-tra/ten-moi',
        status_code: 301,
      }),
    });
    expect(revalidate.revalidateSite).toHaveBeenCalledWith('dieptra');
  });
});

describe('ProductService POS image toggle', () => {
  const posProduct = {
    id: BigInt(7),
    title: 'Trà',
    images_url: null,
    pos_code: 'SP01',
    pos_images: ['https://pos/a.jpg', 'https://pos/b.jpg'],
    kiotviet_images: ['https://kiot/old.jpg'],
  };

  const merge = (service: ProductService, sc: any) =>
    (service as any).mergeProductWithSiteConfig(
      { ...posProduct, site_configs: sc ? [sc] : [] },
      'dieptra',
    );

  it('shows CMS images first, then POS images when the toggle is on', () => {
    const { service } = createService();
    const result = merge(service, {
      images_url: JSON.stringify(['https://cms/1.jpg']),
      use_pos_images: true,
    });

    expect(result.imagesUrl).toEqual([
      'https://cms/1.jpg',
      'https://pos/a.jpg',
      'https://pos/b.jpg',
    ]);
    expect(result.usePosImages).toBe(true);
  });

  it('does not use POS images by default when the site has no config row', () => {
    const { service } = createService();
    const result = merge(service, null);

    expect(result.usePosImages).toBe(false);
    expect(result.imagesUrl).toEqual([]);
    expect(result.posImages).toEqual([]);
  });

  it('hides every third-party image field when the toggle is off', () => {
    const { service } = createService();
    const result = merge(service, {
      images_url: JSON.stringify(['https://pos/a.jpg', 'https://cms/1.jpg']),
      use_pos_images: false,
    });

    // URL POS bị copy vào images_url (dữ liệu cũ) cũng phải bị loại
    expect(result.imagesUrl).toEqual(['https://cms/1.jpg']);
    expect(result.posImages).toEqual([]);
    expect(result.kiotviet_images).toBeNull();
  });

  it('returns no images when the toggle is off and CMS has none', () => {
    const { service } = createService();
    const result = merge(service, {
      images_url: null,
      use_pos_images: false,
    });

    expect(result.imagesUrl).toEqual([]);
  });

  it('saves use_pos_images only when a boolean is sent', async () => {
    const { service, prisma } = createService();
    const tx = {
      product_site_config: {
        upsert: jest.fn().mockResolvedValue(savedSiteConfig),
      },
      url_redirect: { findUnique: jest.fn(), upsert: jest.fn() },
    };

    prisma.product.findUnique.mockResolvedValue({
      id: BigInt(7),
      title: 'Trà',
      pos_name: null,
      kiotviet_name: null,
    });
    prisma.product_site_config.findUnique.mockResolvedValue({
      id: BigInt(10),
      slug: 'tra',
    });
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await service.upsertProductSiteConfig(7, 'dieptra', {
      use_pos_images: false,
    });
    await service.upsertProductSiteConfig(7, 'dieptra', {
      title: 'Trà',
      use_pos_images: 'false' as never,
    });

    const [first, second] = tx.product_site_config.upsert.mock.calls;
    expect(first[0].update).toHaveProperty('use_pos_images', false);
    expect(second[0].update).not.toHaveProperty('use_pos_images');
  });
});
