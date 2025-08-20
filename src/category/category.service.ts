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
        // ✅ SỬA: Array format
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
    parentId?: string;
  }) {
    try {
      const { pageSize, pageNumber, parentId } = params;

      this.logger.log(
        `🔍 Getting categories with pagination - Page: ${pageNumber}, Size: ${pageSize}`,
      );

      const skip = pageNumber * pageSize;
      const take = pageSize;

      // 📊 WHERE CONDITION
      const where: Prisma.categoryWhereInput = {};

      if (parentId && parentId !== '') {
        if (parentId === 'null' || parentId === '0') {
          where.parent_id = null;
        } else {
          where.parent_id = parseInt(parentId);
        }
      }

      // 🔍 GET PAGINATED CATEGORIES WITH PRODUCT COUNT
      const [categories, total] = await Promise.all([
        this.prisma.category.findMany({
          where,
          skip,
          take,
          orderBy: [{ priority: 'asc' }, { name: 'asc' }],
          include: {
            product: {
              select: { id: true }, // Chỉ lấy ID để đếm
            },
          },
        }),
        this.prisma.category.count({ where }),
      ]);

      const allCategories = await this.prisma.category.findMany({
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
        include: {
          product: {
            select: { id: true },
          },
        },
      });

      const categoryMap = new Map(
        allCategories.map((cat) => [Number(cat.id), cat]),
      );

      const transformedCategories = await Promise.all(
        categories.map(async (category) => {
          const categoryId = Number(category.id);

          const level = this.calculateCategoryLevel(categoryId, categoryMap);

          const displayName = this.generateDisplayName(category.name, level);

          const productCount = category.product.length;

          const hasChildren = await this.checkHasChildren(categoryId);

          const hasProducts = productCount > 0;

          return {
            id: categoryId,
            name: category.name,
            description: category.description,
            parent_id: category.parent_id,
            priority: category.priority || 0,

            productCount,
            level,
            displayName,
            hasChildren,
            hasProducts,
          };
        }),
      );

      const result = {
        success: true,
        data: transformedCategories,
        pagination: {
          total,
          pageSize,
          pageNumber,
          totalPages: Math.ceil(total / pageSize),
        },
        message: 'Categories fetched successfully',
      };

      this.logger.log(
        `✅ Successfully fetched ${transformedCategories.length}/${total} categories with computed fields`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Failed to get paginated categories:`,
        error.message,
      );
      throw new BadRequestException(
        `Failed to get categories: ${error.message}`,
      );
    }
  }

  private calculateCategoryLevel(
    categoryId: number,
    categoryMap: Map<number, any>,
  ): number {
    let level = 0;
    let currentCategory = categoryMap.get(categoryId);

    while (currentCategory?.parent_id) {
      level++;
      currentCategory = categoryMap.get(currentCategory.parent_id);

      if (level > 10) break;
    }

    return level;
  }

  private generateDisplayName(name: string | null, level: number): string {
    const safeName = name || 'Unnamed Category';
    const indent = '  '.repeat(level);
    const prefix = level > 0 ? '└ ' : '';
    return `${indent}${prefix}${safeName}`;
  }

  private async checkHasChildren(categoryId: number): Promise<boolean> {
    const childCount = await this.prisma.category.count({
      where: { parent_id: categoryId },
    });

    return childCount > 0;
  }

  async findOne(id: number) {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
        include: {
          product: {
            select: { id: true, title: true, kiotviet_name: true },
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
      }

      const updatedCategory = await this.prisma.category.update({
        where: { id: BigInt(id) },
        data: {
          name: updateCategoryDto.name,
          description: updateCategoryDto.description,
          parent_id: updateCategoryDto.parent_id
            ? updateCategoryDto.parent_id
            : null,
          priority: updateCategoryDto.priority,
        },
      });

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

  async remove(id: number) {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id: BigInt(id) },
        include: {
          product: { select: { id: true } },
        },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      if (category.product.length > 0) {
        throw new BadRequestException(
          `Cannot delete category. It has ${category.product.length} products assigned to it.`,
        );
      }

      const childCategories = await this.prisma.category.count({
        where: { parent_id: id },
      });

      if (childCategories > 0) {
        throw new BadRequestException(
          `Cannot delete category. It has ${childCategories} child categories.`,
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

  async updateProductCategory(productId: number, categoryId: number) {
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

        // ✅ Thêm các trường cần thiết cho CMS
        level: 0, // Sẽ được tính toán ở frontend nếu cần
        displayName: cat.name, // Tên hiển thị đơn giản
        hasChildren: false, // Sẽ được tính toán
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
        cat.displayName = '  '.repeat(cat.level) + cat.name;
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
