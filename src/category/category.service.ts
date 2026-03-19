import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, CategoryTreeDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private prisma: PrismaService) {}

  async create(
    createCategoryDto: CreateCategoryDto,
    siteCode: string = 'dieptra',
  ) {
    try {
      if (createCategoryDto.parent_id) {
        const parentCategory = await this.prisma.category.findUnique({
          where: { id: BigInt(createCategoryDto.parent_id) },
        });

        if (!parentCategory) {
          throw new BadRequestException('Parent category not found');
        }

        if (parentCategory.site_code !== siteCode) {
          throw new BadRequestException(
            `Parent category belongs to site "${parentCategory.site_code}", not "${siteCode}"`,
          );
        }
      }

      const category = await this.prisma.category.create({
        data: {
          name: createCategoryDto.name,
          name_en: createCategoryDto.name_en,
          description: createCategoryDto.description,
          title_meta: createCategoryDto.title_meta,
          parent_id: createCategoryDto.parent_id
            ? createCategoryDto.parent_id
            : null,
          priority: createCategoryDto.priority || 0,
          is_featured: createCategoryDto.is_featured ?? false,
          slug: this.convertToSlug(createCategoryDto.name),
          image_url: createCategoryDto.image_url,
          site_code: siteCode,
        },
      });

      await this.recalculateHierarchy(siteCode);

      return {
        success: true,
        data: {
          ...category,
          id: Number(category.id),
          parent_id: category.parent_id ? Number(category.parent_id) : null,
        },
        message: 'Category created successfully',
      };
    } catch (error) {
      this.logger.error(`Error creating category: ${error.message}`);
      throw error;
    }
  }

  async getAllCategoriesTree(
    siteCode: string = 'dieptra',
  ): Promise<CategoryTreeDto[]> {
    try {
      const categories = await this.prisma.category.findMany({
        where: { site_code: siteCode },
        include: {
          product: {
            select: { id: true },
          },
        },
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      });

      const categoriesWithCount = categories.map((cat) => ({
        id: Number(cat.id),
        name: cat.name,
        name_en: cat.name_en,
        description: cat.description,
        parent_id: cat.parent_id ? Number(cat.parent_id) : null,
        priority: cat.priority || 0,
        productCount: cat.product.length,
        children: [],
      }));

      return this.buildCategoryTree(categoriesWithCount);
    } catch (error) {
      this.logger.error(`Error fetching categories tree: ${error.message}`);
      throw new BadRequestException(
        `Failed to fetch categories tree: ${error.message}`,
      );
    }
  }

  async getAllCategories(
    params: { pageSize: number; pageNumber: number; name?: string },
    siteCode: string = 'dieptra',
  ) {
    const { pageSize = 10, pageNumber = 0, name } = params;

    const where: any = { site_code: siteCode };
    if (name) {
      where.name = { contains: name };
    }

    const [total, categories] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        include: {
          parent: true,
          children: true,
          product: { select: { id: true } },
        },
        orderBy: [{ level: 'asc' }, { priority: 'asc' }, { name: 'asc' }],
        skip: pageNumber * pageSize,
        take: pageSize,
      }),
    ]);

    const data = categories.map((cat) => ({
      id: Number(cat.id),
      name: cat.name,
      name_en: cat.name_en,
      description: cat.description,
      title_meta: cat.title_meta,
      slug: cat.slug,
      image_url: cat.image_url,
      parent_id: cat.parent_id ? Number(cat.parent_id) : null,
      parent_name: cat.parent?.name,
      priority: cat.priority || 0,
      is_featured: cat.is_featured ?? false,
      level: cat.level,
      path: cat.path,
      productCount: cat.product_count,
      directProductCount: cat.direct_product_count,
      childCount: cat.child_count,
      hasChildren: cat.children.length > 0,
      hasProducts: cat.product.length > 0,
    }));

    return {
      content: data,
      totalElements: total,
      totalPages: Math.ceil(total / pageSize),
      size: pageSize,
      number: pageNumber,
    };
  }

  async findOne(id: number, siteCode: string = 'dieptra') {
    const category = await this.prisma.category.findUnique({
      where: { id: BigInt(id) },
      include: {
        parent: true,
        children: { orderBy: { priority: 'asc' } },
        product: { select: { id: true, title: true, kiotviet_name: true } },
      },
    });

    if (!category) throw new NotFoundException('Category not found');

    if (category.site_code !== siteCode) {
      throw new BadRequestException('Category does not belong to this site');
    }

    return {
      success: true,
      data: {
        id: Number(category.id),
        name: category.name,
        name_en: category.name_en,
        description: category.description,
        title_meta: category.title_meta,
        slug: category.slug,
        image_url: category.image_url,
        priority: category.priority,
        level: category.level,
        path: category.path,
        site_code: category.site_code,
        parent_id: category.parent_id ? Number(category.parent_id) : null,
        parent_name: category.parent?.name,
        children: category.children.map((c) => ({
          id: Number(c.id),
          name: c.name,
          slug: c.slug,
        })),
        products: category.product.map((p) => ({
          id: Number(p.id),
          name: p.title || p.kiotviet_name,
        })),
      },
      message: 'Category fetched successfully',
    };
  }

  async update(
    id: number,
    updateCategoryDto: UpdateCategoryDto,
    siteCode: string = 'dieptra',
  ) {
    try {
      const existingCategory = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
      });

      if (!existingCategory) {
        throw new NotFoundException('Category not found');
      }

      if (existingCategory.site_code !== siteCode) {
        throw new BadRequestException(
          `Category belongs to site "${existingCategory.site_code}", cannot edit from "${siteCode}"`,
        );
      }

      const updateData: any = {};

      if (updateCategoryDto.name) {
        updateData.name = updateCategoryDto.name;
        updateData.slug = this.convertToSlug(updateCategoryDto.name);
      }
      if (updateCategoryDto.name_en !== undefined)
        updateData.name_en = updateCategoryDto.name_en;
      if (updateCategoryDto.description !== undefined)
        updateData.description = updateCategoryDto.description;
      if (updateCategoryDto.title_meta !== undefined)
        updateData.title_meta = updateCategoryDto.title_meta;
      if (updateCategoryDto.priority !== undefined)
        updateData.priority = updateCategoryDto.priority;
      if (updateCategoryDto.image_url !== undefined)
        updateData.image_url = updateCategoryDto.image_url;
      if (updateCategoryDto.is_featured !== undefined)
        updateData.is_featured = updateCategoryDto.is_featured;

      if (updateCategoryDto.parent_id !== undefined) {
        if (updateCategoryDto.parent_id && updateCategoryDto.parent_id === id) {
          throw new BadRequestException('Category cannot be its own parent');
        }

        if (updateCategoryDto.parent_id) {
          const parentCategory = await this.prisma.category.findUnique({
            where: { id: BigInt(updateCategoryDto.parent_id) },
          });

          if (!parentCategory) {
            throw new BadRequestException('Parent category not found');
          }

          if (parentCategory.site_code !== siteCode) {
            throw new BadRequestException(
              'Parent category belongs to a different site',
            );
          }

          await this.validateNoCircularReference(
            id,
            updateCategoryDto.parent_id,
          );
        }

        updateData.parent_id = updateCategoryDto.parent_id
          ? BigInt(updateCategoryDto.parent_id)
          : null;
      }

      const updatedCategory = await this.prisma.category.update({
        where: { id: BigInt(id) },
        data: updateData,
      });

      await this.recalculateHierarchy(siteCode);

      return {
        success: true,
        data: {
          ...updatedCategory,
          id: Number(updatedCategory.id),
          parent_id: updatedCategory.parent_id
            ? Number(updatedCategory.parent_id)
            : null,
        },
        message: 'Category updated successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      this.logger.error(`Error updating category: ${error.message}`);
      throw new BadRequestException(
        `Failed to update category: ${error.message}`,
      );
    }
  }

  private async validateNoCircularReference(
    categoryId: number,
    newParentId: number,
  ) {
    let currentId: number | null = newParentId;
    const visited = new Set<number>();

    while (currentId) {
      if (currentId === categoryId) {
        throw new BadRequestException('Circular reference detected');
      }
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const parent = await this.prisma.category.findUnique({
        where: { id: BigInt(currentId) },
        select: { parent_id: true },
      });
      currentId = parent?.parent_id ? Number(parent.parent_id) : null;
    }
  }

  private async getAncestorIds(categoryId: number): Promise<number[]> {
    const ancestors: number[] = [];
    let currentId = categoryId;

    while (currentId) {
      const category = await this.prisma.category.findUnique({
        where: { id: BigInt(currentId) },
        select: { parent_id: true },
      });

      if (!category?.parent_id) break;

      const parentId = Number(category.parent_id);
      if (ancestors.includes(parentId)) break; // Prevent infinite loop

      ancestors.push(parentId);
      currentId = parentId;
    }

    return ancestors;
  }

  async recalculateHierarchy(siteCode?: string) {
    const where: any = siteCode ? { site_code: siteCode } : {};

    const allCategories = await this.prisma.category.findMany({
      where,
      include: {
        children: { select: { id: true } },
        product: { select: { id: true } },
      },
      orderBy: { id: 'asc' },
    });

    for (const cat of allCategories) {
      const level = await this.calculateLevel(cat.id, allCategories);
      const path = await this.buildPath(cat.id, allCategories);
      const descendantIds = this.getDescendantIds(
        Number(cat.id),
        allCategories,
      );

      const totalProductCount = allCategories
        .filter(
          (c) =>
            descendantIds.includes(Number(c.id)) ||
            Number(c.id) === Number(cat.id),
        )
        .reduce((sum, c) => sum + c.product.length, 0);

      await this.prisma.category.update({
        where: { id: cat.id },
        data: {
          level,
          path,
          child_count: cat.children.length,
          direct_product_count: cat.product.length,
          product_count: totalProductCount,
        },
      });
    }
  }

  private async calculateLevel(
    categoryId: bigint,
    allCategories: any[],
  ): Promise<number> {
    let level = 0;
    let current = allCategories.find((c) => c.id === categoryId);
    while (current?.parent_id) {
      level++;
      current = allCategories.find((c) => c.id === current.parent_id);
      if (level > 10) break;
    }
    return level;
  }

  private getDescendantIds(categoryId: number, allCategories: any[]): number[] {
    const descendants: number[] = [];
    const children = allCategories.filter(
      (c) => Number(c.parent_id) === categoryId,
    );
    for (const child of children) {
      descendants.push(Number(child.id));
      descendants.push(
        ...this.getDescendantIds(Number(child.id), allCategories),
      );
    }
    return descendants;
  }

  async remove(id: number, siteCode: string = 'dieptra') {
    const category = await this.prisma.category.findUnique({
      where: { id: BigInt(id) },
      include: { children: true, product: { select: { id: true } } },
    });

    if (!category) throw new NotFoundException('Category not found');

    if (category.site_code !== siteCode) {
      throw new BadRequestException(
        `Category belongs to site "${category.site_code}", cannot delete from "${siteCode}"`,
      );
    }

    await this.prisma.category.delete({ where: { id: BigInt(id) } });
    await this.recalculateHierarchy(siteCode);

    return { success: true, message: 'Category deleted successfully' };
  }

  async reassignProducts(fromCategoryId: number, toCategoryId: number | null) {
    try {
      const fromCategory = await this.prisma.category.findUnique({
        where: { id: BigInt(fromCategoryId) },
        select: { name: true, name_en: true },
      });

      if (!fromCategory) {
        throw new NotFoundException('Source category not found');
      }

      if (toCategoryId) {
        const toCategory = await this.prisma.category.findUnique({
          where: { id: BigInt(toCategoryId) },
          select: { name: true, name_en: true },
        });

        if (!toCategory) {
          throw new NotFoundException('Destination category not found');
        }
      }

      const result = await this.prisma.product.updateMany({
        where: { category_id: BigInt(fromCategoryId) },
        data: { category_id: toCategoryId ? BigInt(toCategoryId) : null },
      });

      return {
        success: true,
        data: {
          reassignedCount: result.count,
          fromCategory: fromCategory.name,
          toCategory: toCategoryId ? 'specified category' : 'uncategorized',
        },
        message: `Successfully reassigned ${result.count} products`,
      };
    } catch (error) {
      this.logger.error(`Error reassigning products: ${error.message}`);
      throw error;
    }
  }

  async updateCategory(productId: number, categoryId: number) {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: BigInt(productId) },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      const category = await this.prisma.category.findUnique({
        where: { id: BigInt(categoryId) },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      const updatedProduct = await this.prisma.product.update({
        where: { id: BigInt(productId) },
        data: { category_id: BigInt(categoryId) },
        include: {
          category: { select: { id: true, name: true, name_en: true } },
        },
      });

      return {
        success: true,
        data: {
          productId: Number(updatedProduct.id),
          categoryId: Number(updatedProduct.category_id),
          categoryName: updatedProduct.category?.name,
          productName: updatedProduct.title || updatedProduct.kiotviet_name,
        },
        message: 'Product category updated successfully',
      };
    } catch (error) {
      this.logger.error(`Error updating product category: ${error.message}`);
      throw error;
    }
  }

  private buildCategoryTree(categories: any[]): CategoryTreeDto[] {
    const categoryMap = new Map();
    const roots: CategoryTreeDto[] = [];

    categories.forEach((cat) =>
      categoryMap.set(cat.id, { ...cat, children: [] }),
    );
    categories.forEach((cat) => {
      if (cat.parent_id && categoryMap.has(cat.parent_id)) {
        categoryMap.get(cat.parent_id).children.push(categoryMap.get(cat.id));
      } else {
        roots.push(categoryMap.get(cat.id));
      }
    });

    return roots;
  }

  async getCategoriesFlat() {
    try {
      const categories = await this.prisma.category.findMany({
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      });

      const flatCategories = categories.map((cat) => ({
        id: Number(cat.id),
        name: cat.name,
        name_en: cat.name_en,
        description: cat.description,
        parent_id: cat.parent_id ? Number(cat.parent_id) : null,
        priority: cat.priority || 0,
        level: 0,
      }));

      const calculateLevel = (
        categoryId: number,
        visited = new Set(),
      ): number => {
        if (visited.has(categoryId)) return 0;
        visited.add(categoryId);

        const category = flatCategories.find((c) => c.id === categoryId);
        if (!category || !category.parent_id) return 0;

        return 1 + calculateLevel(category.parent_id, visited);
      };

      const categoriesWithLevel = flatCategories.map((cat) => ({
        ...cat,
        level: calculateLevel(cat.id),
        displayName: '—'.repeat(calculateLevel(cat.id)) + ' ' + cat.name,
      }));

      return {
        success: true,
        data: categoriesWithLevel,
        message: 'Categories fetched successfully',
      };
    } catch (error) {
      this.logger.error(`Error fetching flat categories: ${error.message}`);
      throw new BadRequestException(
        `Failed to fetch flat categories: ${error.message}`,
      );
    }
  }

  async getCategoriesForCMS(siteCode: string = 'dieptra') {
    const categories = await this.prisma.category.findMany({
      where: { site_code: siteCode },
      include: {
        parent: true,
        children: true,
        product: { select: { id: true } },
      },
      orderBy: [{ level: 'asc' }, { priority: 'asc' }, { name: 'asc' }],
    });

    const data = categories.map((cat) => ({
      id: Number(cat.id),
      name: cat.name,
      name_en: cat.name_en,
      description: cat.description,
      title_meta: cat.title_meta,
      slug: cat.slug,
      image_url: cat.image_url,
      parent_id: cat.parent_id ? Number(cat.parent_id) : null,
      parent_name: cat.parent?.name,
      priority: cat.priority || 0,
      is_featured: cat.is_featured ?? false,
      level: cat.level,
      path: cat.path,
      productCount: cat.product_count,
      directProductCount: cat.direct_product_count,
      childCount: cat.child_count,
      displayName:
        cat.level > 0 ? `${'— '.repeat(cat.level)}${cat.name}` : cat.name,
      hasChildren: cat.children.length > 0,
      hasProducts: cat.product.length > 0,
    }));

    return {
      success: true,
      data,
      total: data.length,
      message: 'Categories fetched successfully',
    };
  }

  async findBySlug(slug: string, siteCode: string = 'dieptra') {
    const category = await this.prisma.category.findFirst({
      where: { slug, site_code: siteCode },
    });

    return category;
  }

  convertToSlug(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a')
      .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e')
      .replace(/ì|í|ị|ỉ|ĩ/g, 'i')
      .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o')
      .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u')
      .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async generateSlugsForExistingCategories(siteCode?: string) {
    const where: any = { OR: [{ slug: null }, { slug: '' }] };
    if (siteCode) where.site_code = siteCode;

    const categories = await this.prisma.category.findMany({ where });

    let updated = 0;
    for (const cat of categories) {
      if (cat.name) {
        await this.prisma.category.update({
          where: { id: cat.id },
          data: { slug: this.convertToSlug(cat.name) },
        });
        updated++;
      }
    }

    return { success: true, updated, total: categories.length };
  }

  async getCategoriesForDropdown(siteCode: string = 'dieptra') {
    const result = await this.getCategoriesForCMS(siteCode);

    return result.data.map((cat) => ({
      id: cat.id,
      name: cat.name,
      displayName: cat.displayName || cat.name,
      level: cat.level || 0,
      parent_id: cat.parent_id,
    }));
  }

  async resolveCategoryPath(slugPath: string[], siteCode: string = 'dieptra') {
    let parentId: bigint | null = null;

    for (const slug of slugPath) {
      const category = await this.prisma.category.findFirst({
        where: {
          slug,
          parent_id: parentId,
          site_code: siteCode,
        },
      });

      if (!category) return null;
      parentId = category.id;
    }

    if (!parentId) return null;

    const finalCategory = await this.prisma.category.findUnique({
      where: { id: parentId },
    });

    return finalCategory
      ? {
          id: Number(finalCategory.id),
          name: finalCategory.name,
          name_en: finalCategory.name_en,
          slug: finalCategory.slug,
          description: finalCategory.description,
        }
      : null;
  }

  private sortCategoriesByHierarchy(categories: any[]): any[] {
    return categories.sort((a, b) => {
      if (!a.parent_id && b.parent_id) return -1;
      if (a.parent_id && !b.parent_id) return 1;
      return 0;
    });
  }

  private async buildPath(
    categoryId: bigint,
    allCategories: any[],
  ): Promise<string> {
    const path: number[] = [];
    let current = allCategories.find((c) => c.id === categoryId);
    while (current) {
      path.unshift(Number(current.id));
      if (!current.parent_id) break;
      current = allCategories.find((c) => c.id === current.parent_id);
    }
    return path.join('/');
  }

  async buildCategoryPath(categoryIds: number[]): Promise<string[]> {
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds.map((id) => BigInt(id)) } },
      select: { id: true, slug: true, parent_id: true },
    });

    const sortedCategories = this.sortCategoriesByHierarchy(categories);
    return sortedCategories.map((cat) => cat.slug).filter(Boolean);
  }

  async findBySlugForClient(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug },
      select: {
        id: true,
        name: true,
        name_en: true,
        slug: true,
        description: true,
        level: true,
        parent_id: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    return {
      id: Number(category.id),
      name: category.name,
      name_en: category.name_en,
      slug: category.slug,
      description: category.description,
      level: category.level,
      parentId: category.parent_id ? Number(category.parent_id) : null,
    };
  }
}
