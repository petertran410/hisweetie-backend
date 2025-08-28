// src/utils/category-slug-resolver.js
export class CategorySlugResolver {
  static slugToIdCache = new Map();
  static idToSlugCache = new Map();

  static async resolveSlugToId(categorySlug) {
    if (this.slugToIdCache.has(categorySlug)) {
      return this.slugToIdCache.get(categorySlug);
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_DOMAIN}/api/categories/resolve-by-slugs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugs: [categorySlug] }),
        },
      );

      const [categoryData] = await response.json();
      if (categoryData) {
        this.slugToIdCache.set(categorySlug, categoryData.id);
        this.idToSlugCache.set(categoryData.id, categorySlug);
        return categoryData.id;
      }
    } catch (error) {
      console.error('Slug resolution failed:', error);
    }
    return null;
  }

  static async resolveIdToSlug(categoryId) {
    if (this.idToSlugCache.has(categoryId)) {
      return this.idToSlugCache.get(categoryId);
    }

    await this.buildSlugCache();
    return this.idToSlugCache.get(categoryId);
  }

  static async buildSlugCache() {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_DOMAIN}/api/categories/client/hierarchy`,
      );
      const categories = await response.json();

      this.buildCacheFromHierarchy(categories);
    } catch (error) {
      console.error('Cache build failed:', error);
    }
  }

  static buildCacheFromHierarchy(categories) {
    categories.forEach((category) => {
      if (category.slug) {
        this.slugToIdCache.set(category.slug, category.id);
        this.idToSlugCache.set(category.id, category.slug);
      }

      if (category.children) {
        this.buildCacheFromHierarchy(category.children);
      }
    });
  }
}
