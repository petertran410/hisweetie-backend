import { Prisma } from './../../node_modules/.prisma/client/index.d';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryTreeDto,
} from './dto/create-category.dto';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    try {
      if (createCategoryDto.parent_id) {
        const parentCategory = await this.prisma.category.findUnique({
          where: { id: BigInt(createCategoryDto.parent_id) },
        });

        if (!parentCategory) {
          throw new BadRequestException('Parent category not found');
        }
      }

      const category = await this.prisma.category.create({
        data: {
          name: createCategoryDto.name,
          description: createCategoryDto.description,
          parent_id: createCategoryDto.parent_id
            ? createCategoryDto.parent_id
            : null,
          priority: createCategoryDto.priority || 0,
        },
      });

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

  async getAllCategoriesTree(): Promise<CategoryTreeDto[]> {
    try {
      const categories = await this.prisma.category.findMany({
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

  async getAllCategories(params: {
    pageSize: number;
    pageNumber: number;
    name?: string;
  }) {
    const { pageNumber, pageSize, name } = params;
    const skip = pageNumber * pageSize;

    const whereClause = name
      ? {
          name: { contains: name, mode: 'insensitive' },
        }
      : {};

    const [categories, totalCount] = await Promise.all([
      this.prisma.category.findMany({
        where: whereClause,
        include: {
          product: { select: { id: true } },
          parent: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.category.count({ where: whereClause }),
    ]);

    const transformedCategories = categories.map((cat) => ({
      id: Number(cat.id),
      name: cat.name,
      description: cat.description,
      parent_id: cat.parent_id ? Number(cat.parent_id) : null,
      parent_name: cat.parent?.name || null,
      priority: cat.priority || 0,
      productCount: cat.product.length,
      level: 0,
      displayName: cat.name,
      hasChildren: false,
      hasProducts: cat.product.length > 0,
    }));

    return {
      success: true,
      content: transformedCategories,
      totalElements: totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
      number: pageNumber,
      size: pageSize,
      message: 'Categories for CMS fetched successfully',
    };
  }

  async findOne(id: number) {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
        include: {
          product: {
            select: { id: true, title: true, kiotviet_name: true },
          },
          parent: {
            select: { id: true, name: true },
          },
        },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      return {
        success: true,
        data: {
          ...category,
          id: Number(category.id),
          parent_id: category.parent_id ? Number(category.parent_id) : null,
          parent_name: category.parent?.name,
          products: category.product.map((p) => ({
            id: Number(p.id),
            name: p.title || p.kiotviet_name,
          })),
        },
        message: 'Category fetched successfully',
      };
    } catch (error) {
      this.logger.error(`Error fetching category ${id}: ${error.message}`);
      throw error;
    }
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    try {
      const existingCategory = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
      });

      if (!existingCategory) {
        throw new NotFoundException('Category not found');
      }

      if (updateCategoryDto.parent_id) {
        if (updateCategoryDto.parent_id === id) {
          throw new BadRequestException('Category cannot be its own parent');
        }

        const parentCategory = await this.prisma.category.findUnique({
          where: { id: BigInt(updateCategoryDto.parent_id) },
        });

        if (!parentCategory) {
          throw new BadRequestException('Parent category not found');
        }

        await this.validateNoCircularReference(id, updateCategoryDto.parent_id);
      }

      const oldParentId = existingCategory.parent_id
        ? Number(existingCategory.parent_id)
        : null;
      const newParentId = updateCategoryDto.parent_id || null;

      console.log(
        `🔄 Updating category ${id}: ${oldParentId} → ${newParentId}`,
      );

      const updatedCategory = await this.prisma.category.update({
        where: { id: BigInt(id) },
        data: {
          name: updateCategoryDto.name,
          description: updateCategoryDto.description,
          parent_id: updateCategoryDto.parent_id
            ? BigInt(updateCategoryDto.parent_id)
            : null,
          priority: updateCategoryDto.priority,
        },
      });

      await this.recalculateHierarchy();

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
      this.logger.error(`Error updating category ${id}: ${error.message}`);
      throw error;
    }
  }

  private async validateNoCircularReference(
    categoryId: number,
    newParentId: number,
  ): Promise<void> {
    const ancestors = await this.getAncestorIds(newParentId);
    if (ancestors.includes(categoryId)) {
      throw new BadRequestException(
        'Cannot create circular reference in category hierarchy',
      );
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

  async recalculateHierarchy(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.updateLevelsAndPaths(tx);

      await this.updateChildCounts(tx);

      await this.updateProductCounts(tx);
    });
  }

  private async updateLevelsAndPaths(tx: any): Promise<void> {
    const categories = await tx.category.findMany({
      orderBy: { id: 'asc' },
    });

    for (const category of categories) {
      const level = await this.calculateLevel(Number(category.id), tx);
      const path = await this.calculatePath(Number(category.id), tx);

      await tx.category.update({
        where: { id: category.id },
        data: { level, path },
      });
    }
  }

  private async calculateLevel(categoryId: number, tx: any): Promise<number> {
    const category = await tx.category.findUnique({
      where: { id: BigInt(categoryId) },
      select: { parent_id: true },
    });

    if (!category?.parent_id) return 0;

    const parentLevel = await this.calculateLevel(
      Number(category.parent_id),
      tx,
    );
    return parentLevel + 1;
  }

  private async calculatePath(categoryId: number, tx: any): Promise<string> {
    const ancestors: number[] = [];
    let currentId: number | null = categoryId;

    while (currentId) {
      ancestors.unshift(currentId);

      const category = await tx.category.findUnique({
        where: { id: BigInt(currentId) },
        select: { parent_id: true },
      });

      currentId = category?.parent_id ? Number(category.parent_id) : null;
    }

    return `/${ancestors.join('/')}/`;
  }

  private async updateChildCounts(tx: any): Promise<void> {
    console.log('🔄 Starting updateChildCounts...');

    const categories = await tx.category.findMany({
      orderBy: { id: 'asc' },
    });

    console.log(
      `📊 Found ${categories.length} categories to update child counts`,
    );

    for (const category of categories) {
      const childCount = await tx.category.count({
        where: { parent_id: category.id },
      });

      console.log(
        `👶 Category ${Number(category.id)} - Children: ${childCount}`,
      );

      await tx.category.update({
        where: { id: category.id },
        data: { child_count: childCount },
      });
    }

    console.log('✅ updateChildCounts completed');
  }

  private async updateProductCounts(tx: any): Promise<void> {
    console.log('🔄 Starting updateProductCounts...');

    const categories = await tx.category.findMany({
      orderBy: { id: 'asc' },
    });

    console.log(
      `📊 Found ${categories.length} categories to update product counts`,
    );

    for (const category of categories) {
      const directCount = await tx.product.count({
        where: { category_id: category.id },
      });

      console.log(
        `📝 Category ${Number(category.id)} - Direct products: ${directCount}`,
      );

      const descendantIds = await this.getDescendantIds(
        Number(category.id),
        tx,
      );
      console.log(
        `👶 Category ${Number(category.id)} - Descendants: [${descendantIds.join(', ')}]`,
      );

      const allCategoryIds = [
        category.id,
        ...descendantIds.map((id) => BigInt(id)),
      ];

      const totalCount = await tx.product.count({
        where: { category_id: { in: allCategoryIds } },
      });

      console.log(
        `📊 Category ${Number(category.id)} - Total products: ${totalCount}`,
      );

      await tx.category.update({
        where: { id: category.id },
        data: {
          direct_product_count: Math.max(0, directCount),
          product_count: Math.max(0, totalCount),
        },
      });
    }

    console.log('✅ updateProductCounts completed');
  }

  private async getDescendantIds(
    categoryId: number,
    tx: any,
  ): Promise<number[]> {
    const descendants: number[] = [];

    const children = await tx.category.findMany({
      where: { parent_id: BigInt(categoryId) },
      select: { id: true },
    });

    for (const child of children) {
      const childId = Number(child.id);
      descendants.push(childId);

      const grandChildren = await this.getDescendantIds(childId, tx);
      descendants.push(...grandChildren);
    }

    return descendants;
  }

  async remove(id: number) {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
        include: {
          product: { select: { id: true, title: true, kiotviet_name: true } },
          children: { select: { id: true, name: true } },
        },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      if (category.children.length > 0) {
        throw new BadRequestException(
          `Cannot delete category. It has ${category.children.length} child categories: ${category.children.map((c) => c.name).join(', ')}`,
        );
      }

      if (category.product.length > 0) {
        const productNames = category.product
          .map((p) => p.title || p.kiotviet_name)
          .slice(0, 3);
        const displayNames =
          productNames.join(', ') +
          (category.product.length > 3
            ? `... và ${category.product.length - 3} sản phẩm khác`
            : '');

        throw new BadRequestException(
          `Cannot delete category "${category.name}". It has ${category.product.length} products assigned: ${displayNames}. Please reassign these products to another category first.`,
        );
      }

      await this.prisma.category.delete({
        where: { id: BigInt(id) },
      });

      return {
        success: true,
        message: 'Category deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Error deleting category ${id}: ${error.message}`);
      throw error;
    }
  }

  async reassignProducts(fromCategoryId: number, toCategoryId: number | null) {
    try {
      const fromCategory = await this.prisma.category.findUnique({
        where: { id: BigInt(fromCategoryId) },
        select: { name: true },
      });

      if (!fromCategory) {
        throw new NotFoundException('Source category not found');
      }

      if (toCategoryId) {
        const toCategory = await this.prisma.category.findUnique({
          where: { id: BigInt(toCategoryId) },
          select: { name: true },
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
          category: { select: { id: true, name: true } },
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

  /**
   * Xây dựng cấu trúc tree từ danh sách categories
   */
  private buildCategoryTree(categories: any[]): CategoryTreeDto[] {
    const categoryMap = new Map();
    const roots: CategoryTreeDto[] = [];

    // Tạo map để tra cứu nhanh
    categories.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Xây dựng tree
    categories.forEach((cat) => {
      const categoryNode = categoryMap.get(cat.id);

      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.children.push(categoryNode);
        } else {
          // Parent không tồn tại, coi như root
          roots.push(categoryNode);
        }
      } else {
        roots.push(categoryNode);
      }
    });

    return roots;
  }

  async getCategoriesFlat() {
    try {
      const categories = await this.prisma.category.findMany({
        // ✅ SỬA: Sử dụng array format cho orderBy
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      });

      const flatCategories = categories.map((cat) => ({
        id: Number(cat.id),
        name: cat.name,
        description: cat.description,
        parent_id: cat.parent_id ? Number(cat.parent_id) : null,
        priority: cat.priority || 0,
        level: 0,
      }));

      // Calculate hierarchy level for display
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

  async getCategoriesForCMS() {
    try {
      // ✅ SỬA: Lấy tất cả categories với đầy đủ thông tin
      const categories = await this.prisma.category.findMany({
        include: {
          product: {
            select: { id: true },
          },
        },
        // ✅ SỬA: Sử dụng array format cho orderBy
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      });

      // ✅ Transform data với đầy đủ thông tin
      const transformedCategories = categories.map((cat) => ({
        id: Number(cat.id),
        name: cat.name,
        description: cat.description,
        parent_id: cat.parent_id ? Number(cat.parent_id) : null,
        priority: cat.priority || 0,
        productCount: cat.product.length,

        level: 0,
        displayName: cat.name,
        hasChildren: false,
        hasProducts: cat.product.length > 0,
      }));

      // ✅ Tính toán hierarchy level cho display
      const calculateLevel = (
        categoryId: number,
        visited = new Set(),
      ): number => {
        if (visited.has(categoryId)) return 0;
        visited.add(categoryId);

        const category = transformedCategories.find((c) => c.id === categoryId);
        if (!category || !category.parent_id) return 0;

        return 1 + calculateLevel(category.parent_id, visited);
      };

      // ✅ Tính toán hasChildren
      const categoryMap = new Map(
        transformedCategories.map((cat) => [cat.id, cat]),
      );
      transformedCategories.forEach((cat) => {
        cat.level = calculateLevel(cat.id);
        cat.displayName = ''.repeat(cat.level) + cat.name;
        cat.hasChildren = transformedCategories.some(
          (child) => child.parent_id === cat.id,
        );
      });

      return {
        success: true,
        data: transformedCategories,
        total: transformedCategories.length,
        message: 'Categories for CMS fetched successfully',
      };
    } catch (error) {
      this.logger.error(`Error fetching categories for CMS: ${error.message}`);
      throw new BadRequestException(
        `Failed to fetch categories for CMS: ${error.message}`,
      );
    }
  }

  private getCategoryPath(categoryId: number, categories: any[]): string {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return '';

    if (!category.parent_id) {
      return category.name;
    }

    const parentPath = this.getCategoryPath(category.parent_id, categories);
    return parentPath ? `${parentPath} > ${category.name}` : category.name;
  }

  private sortCategoriesByHierarchy(categories: any[]): any[] {
    const categoryMap = new Map();
    const result: any[] = [];

    // Create map for quick lookup
    categories.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Build tree structure
    const roots: any[] = [];
    categories.forEach((cat) => {
      const categoryNode = categoryMap.get(cat.id);

      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.children.push(categoryNode);
        } else {
          roots.push(categoryNode);
        }
      } else {
        roots.push(categoryNode);
      }
    });

    // Flatten tree in hierarchical order
    const flattenTree = (nodes: any[]) => {
      nodes.forEach((node) => {
        result.push(node);
        if (node.children.length > 0) {
          flattenTree(node.children);
        }
      });
    };

    flattenTree(roots);
    return result;
  }
}
