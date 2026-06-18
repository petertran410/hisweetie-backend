import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';

// Key cố định lưu slug danh mục cha dùng cho menu "Sản phẩm" trên header client.
const MENU_ROOT_CATEGORY_SLUG_KEY = 'menu_root_category_slug';

@Injectable()
export class SiteConfigService {
  private readonly logger = new Logger(SiteConfigService.name);

  constructor(private prisma: PrismaService) {}

  // Đọc 1 giá trị config theo key (trong cùng site).
  private async getValue(
    siteCode: string,
    key: string,
  ): Promise<string | null> {
    const row = await this.prisma.site_config.findUnique({
      where: { site_code_config_key: { site_code: siteCode, config_key: key } },
    });
    return row?.config_value ?? null;
  }

  // Upsert 1 giá trị config theo key (trong cùng site).
  private async setValue(siteCode: string, key: string, value: string) {
    return this.prisma.site_config.upsert({
      where: { site_code_config_key: { site_code: siteCode, config_key: key } },
      update: { config_value: value, updated_date: new Date() },
      create: { site_code: siteCode, config_key: key, config_value: value },
    });
  }

  // CMS: danh sách danh mục CHA (parent_id = null, đang active) để chọn.
  // Chỉ trả slug + name, không lộ id ra UI.
  async getParentCategories(siteCode: string = 'dieptra') {
    const parents = await this.prisma.category.findMany({
      where: { site_code: siteCode, parent_id: null, is_active: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      select: { name: true, name_en: true, slug: true },
    });

    return {
      success: true,
      data: parents.map((c) => ({
        name: c.name,
        name_en: c.name_en,
        slug: c.slug,
      })),
    };
  }

  // CMS: lấy cấu hình menu hiện tại (slug đã chọn).
  async getMenuCategoryConfig(siteCode: string = 'dieptra') {
    const slug = await this.getValue(siteCode, MENU_ROOT_CATEGORY_SLUG_KEY);
    return { success: true, data: { slug: slug || null } };
  }

  // CMS: lưu slug danh mục cha. Validate slug là danh mục cha hợp lệ thuộc site.
  async updateMenuCategory(
    dto: UpdateMenuCategoryDto,
    siteCode: string = 'dieptra',
  ) {
    const slug = (dto.slug || '').trim();
    if (!slug) {
      throw new BadRequestException('slug không được rỗng');
    }

    const category = await this.prisma.category.findFirst({
      where: { slug, parent_id: null, site_code: siteCode, is_active: true },
    });
    if (!category) {
      throw new BadRequestException(
        `Không tìm thấy danh mục cha với slug "${slug}" cho site "${siteCode}"`,
      );
    }

    await this.setValue(siteCode, MENU_ROOT_CATEGORY_SLUG_KEY, slug);

    return {
      success: true,
      data: { slug },
      message: 'Cập nhật danh mục menu thành công',
    };
  }

  // Client: trả config menu để header render.
  // configured=false khi chưa cấu hình hoặc slug không resolve được -> client giữ hành vi cũ.
  async getClientMenuCategory(siteCode: string = 'dieptra') {
    const slug = await this.getValue(siteCode, MENU_ROOT_CATEGORY_SLUG_KEY);
    if (!slug) {
      return { configured: false };
    }

    const root = await this.prisma.category.findFirst({
      where: { slug, parent_id: null, site_code: siteCode, is_active: true },
    });
    if (!root) {
      // Slug bị đổi/xóa -> không vỡ header, để client fallback.
      return { configured: false };
    }

    const children = await this.prisma.category.findMany({
      where: { parent_id: root.id, site_code: siteCode, is_active: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, name_en: true, slug: true },
    });

    // Lấy cấp 2 (cháu) cho từng con cấp 1. Tối đa 2 cấp để menu gọn đẹp.
    const childIds = children.map((c) => c.id);
    const grandChildren = childIds.length
      ? await this.prisma.category.findMany({
          where: {
            parent_id: { in: childIds },
            site_code: siteCode,
            is_active: true,
          },
          orderBy: [{ priority: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, name_en: true, slug: true, parent_id: true },
        })
      : [];

    // Gom cháu theo parent_id để map nhanh O(1).
    const grandByParent = new Map<string, typeof grandChildren>();
    for (const g of grandChildren) {
      const key = String(g.parent_id);
      const list = grandByParent.get(key);
      if (list) {
        list.push(g);
      } else {
        grandByParent.set(key, [g]);
      }
    }

    return {
      configured: true,
      id: Number(root.id),
      name: root.name,
      name_en: root.name_en,
      slug: root.slug,
      href: `/san-pham/${root.slug}`,
      children: children.map((c) => {
        const childHref = `/san-pham/${root.slug}/${c.slug}`;
        const grands = grandByParent.get(String(c.id)) || [];
        return {
          id: Number(c.id),
          name: c.name,
          name_en: c.name_en,
          slug: c.slug,
          href: childHref,
          children: grands.map((g) => ({
            id: Number(g.id),
            name: g.name,
            name_en: g.name_en,
            slug: g.slug,
            href: `${childHref}/${g.slug}`,
          })),
        };
      }),
    };
  }
}
