export class SlugUtils {
  static generateSlug(text: string): string {
    if (!text) return '';

    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  static async generateUniqueProductSlug(
    prisma: any,
    title: string,
    excludeId?: number,
  ): Promise<string> {
    let baseSlug = this.generateSlug(title);
    if (!baseSlug) baseSlug = `product-${Date.now()}`;

    let slug = baseSlug;
    let counter = 1;

    while (await this.productSlugExists(prisma, slug, excludeId)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  static async generateUniqueCategorySlug(
    prisma: any,
    name: string,
    excludeId?: number,
  ): Promise<string> {
    let baseSlug = this.generateSlug(name);
    if (!baseSlug) baseSlug = `category-${Date.now()}`;

    let slug = baseSlug;
    let counter = 1;

    while (await this.categorySlugExists(prisma, slug, excludeId)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  private static async productSlugExists(
    prisma: any,
    slug: string,
    excludeId?: number,
  ): Promise<boolean> {
    const where: any = { slug };
    if (excludeId) where.id = { not: excludeId };

    const existing = await prisma.product.findFirst({
      where,
      select: { id: true },
    });

    return !!existing;
  }

  private static async categorySlugExists(
    prisma: any,
    slug: string,
    excludeId?: number,
  ): Promise<boolean> {
    const where: any = { slug };
    if (excludeId) where.id = { not: excludeId };

    const existing = await prisma.category.findFirst({
      where,
      select: { id: true },
    });

    return !!existing;
  }
}
