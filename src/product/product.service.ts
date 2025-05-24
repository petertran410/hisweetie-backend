// src/product/product.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  prisma = new PrismaClient();

  /**
   * Search products with filtering by categories and types
   * Focused on "Trà Phượng Hoàng" and "Lermao" categories
   */
  async search(params: {
    pageSize: number;
    pageNumber: number;
    title?: string;
    categoryNames?: string[];
    productTypes?: string[];
  }) {
    const { pageSize, pageNumber, title, categoryNames, productTypes } = params;

    const where: any = {};

    // Filter by title if provided
    if (title) {
      where['title'] = { contains: title };
    }

    // Target categories: "Trà Phượng Hoàng" and "Lermao"
    const targetCategories = ['Trà Phượng Hoàng', 'Lermao'];
    const categoriesToFilter =
      categoryNames && categoryNames.length > 0
        ? categoryNames.filter((cat) => targetCategories.includes(cat))
        : targetCategories;

    if (categoriesToFilter.length > 0) {
      // Find category IDs by names
      const categories = await this.prisma.category.findMany({
        where: {
          name: {
            in: categoriesToFilter,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (categories.length === 0) {
        this.logger.warn(
          `No target categories found with names: ${categoriesToFilter.join(', ')}`,
        );
        return {
          content: [],
          totalElements: 0,
          availableTypes: [],
          pageable: {
            pageNumber,
            pageSize,
            pageCount: 0,
          },
        };
      }

      const foundCategoryIds = categories.map((cat) => cat.id);
      this.logger.log(
        `Found categories: ${categories.map((c) => `${c.name} (${c.id})`).join(', ')}`,
      );

      where['product_categories'] = {
        some: {
          categories_id: {
            in: foundCategoryIds,
          },
        },
      };
    }

    // Filter by product types if provided
    // Valid types: "Bột", "hàng sãn xuất", "Mứt Sốt", "Siro", "Topping", "Khác (Lermao)", "Khác (Trà Phượng Hoàng)"
    const validTypes = [
      'Bột',
      'hàng sãn xuất',
      'Mứt Sốt',
      'Siro',
      'Topping',
      'Khác (Lermao)',
      'Khác (Trà Phượng Hoàng)',
    ];

    if (productTypes && productTypes.length > 0) {
      const filteredTypes = productTypes.filter((type) =>
        validTypes.includes(type),
      );

      if (filteredTypes.length > 0) {
        where['type'] = {
          in: filteredTypes,
        };
      }
    }

    const totalElements = await this.prisma.product.count({ where });

    const products = await this.prisma.product.findMany({
      where,
      skip: pageNumber * pageSize,
      take: pageSize,
      orderBy: { id: 'desc' },
      include: {
        product_categories: {
          include: {
            category: true,
          },
        },
      },
    });

    // Get available types for the current filter
    const availableTypesQuery = { ...where };
    delete availableTypesQuery.type; // Remove type filter to get all available types

    const availableTypesResult = await this.prisma.product.findMany({
      where: availableTypesQuery,
      select: {
        type: true,
      },
      distinct: ['type'],
      orderBy: {
        type: 'asc',
      },
    });

    const availableTypes = availableTypesResult
      .map((item) => item.type)
      .filter((type) => type && type.trim() !== '' && validTypes.includes(type))
      .sort();

    const content = products.map((product) => {
      let imagesUrl = [];
      try {
        imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
      } catch (error) {
        this.logger.warn(
          `Failed to parse images_url for product ${product.id}:`,
          error,
        );
      }

      return {
        ...product,
        id: product.id.toString(),
        price: product.price ? Number(product.price) : null,
        quantity: product.quantity ? Number(product.quantity) : null,
        imagesUrl,
        isFeatured: product.is_featured,
        type: product.type || 'Chưa phân loại',
        ofCategories: product.product_categories.map((pc) => ({
          id: pc.categories_id.toString(),
          name: pc.category?.name || '',
        })),
      };
    });

    this.logger.log(
      `Search completed: ${content.length} products found with filters:`,
      {
        title,
        categoryNames: categoriesToFilter,
        productTypes,
        totalElements,
        availableTypesCount: availableTypes.length,
      },
    );

    return {
      content,
      totalElements,
      availableTypes,
      pageable: {
        pageNumber,
        pageSize,
        pageCount: Math.ceil(totalElements / pageSize),
      },
    };
  }

  /**
   * Get product types for target categories
   */
  async getProductTypesByCategories(categoryNames: string[]): Promise<{
    types: Array<{
      type: string;
      count: number;
      categoryName: string;
    }>;
    totalTypes: number;
  }> {
    if (!categoryNames || categoryNames.length === 0) {
      return { types: [], totalTypes: 0 };
    }

    // Filter to only target categories
    const targetCategories = ['Trà Phượng Hoàng', 'Lermao'];
    const filteredCategoryNames = categoryNames.filter((cat) =>
      targetCategories.includes(cat),
    );

    if (filteredCategoryNames.length === 0) {
      return { types: [], totalTypes: 0 };
    }

    // Find category IDs
    const categories = await this.prisma.category.findMany({
      where: {
        name: {
          in: filteredCategoryNames,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (categories.length === 0) {
      return { types: [], totalTypes: 0 };
    }

    const categoryIds = categories.map((cat) => cat.id);

    // Get products with their types for these categories
    const products = await this.prisma.product.findMany({
      where: {
        product_categories: {
          some: {
            categories_id: {
              in: categoryIds,
            },
          },
        },
      },
      select: {
        type: true,
        product_categories: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Valid types
    const validTypes = [
      'Bột',
      'hàng sãn xuất',
      'Mứt Sốt',
      'Siro',
      'Topping',
      'Khác (Lermao)',
      'Khác (Trà Phượng Hoàng)',
    ];

    // Count types by category
    const typeCountMap = new Map<
      string,
      { count: number; categoryName: string }
    >();

    products.forEach((product) => {
      const productType = product.type || 'Chưa phân loại';

      // Only include valid types
      if (!validTypes.includes(productType)) {
        return;
      }

      product.product_categories.forEach((pc) => {
        if (
          categoryIds.some((id) => id.toString() === pc.category.id.toString())
        ) {
          const categoryName = pc.category.name || 'Unknown Category';
          const key = `${productType}|${categoryName}`;
          const existing = typeCountMap.get(key);

          if (existing) {
            existing.count += 1;
          } else {
            typeCountMap.set(key, {
              count: 1,
              categoryName: categoryName,
            });
          }
        }
      });
    });

    const types = Array.from(typeCountMap.entries())
      .map(([key, value]) => {
        const [type] = key.split('|');
        return {
          type,
          count: value.count,
          categoryName: value.categoryName,
        };
      })
      .sort((a, b) => {
        // Sort by category name first, then by type name
        if (a.categoryName !== b.categoryName) {
          return a.categoryName.localeCompare(b.categoryName);
        }
        return a.type.localeCompare(b.type);
      });

    return {
      types,
      totalTypes: types.length,
    };
  }

  /**
   * Get all categories (only target categories)
   */
  async getAllCategories(): Promise<
    Array<{
      id: string;
      name: string;
      parentId: string | null;
      parentName: string | null;
    }>
  > {
    const targetCategories = ['Trà Phượng Hoàng', 'Lermao'];

    const categories = await this.prisma.category.findMany({
      where: {
        name: {
          in: targetCategories,
          not: null,
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get parent names
    const parentIds = categories
      .filter((cat) => cat.parent_id !== null)
      .map((cat) => cat.parent_id!);

    let parentMap: Record<string, string> = {};
    if (parentIds.length > 0) {
      const parentCategories = await this.prisma.category.findMany({
        where: {
          id: {
            in: parentIds,
          },
          name: {
            not: null,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });
      parentMap = parentCategories.reduce(
        (acc, parent) => {
          if (parent.name) {
            acc[parent.id.toString()] = parent.name;
          }
          return acc;
        },
        {} as Record<string, string>,
      );
    }

    return categories
      .filter((category) => category.name)
      .map((category) => {
        const parentId = category.parent_id
          ? category.parent_id.toString()
          : null;
        return {
          id: category.id.toString(),
          name: category.name!,
          parentId: parentId,
          parentName: parentId ? parentMap[parentId] || null : null,
        };
      });
  }

  /**
   * Find product by ID
   */
  async findById(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: BigInt(id) },
      include: {
        product_categories: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    let imagesUrl = [];
    try {
      imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
    } catch (error) {
      this.logger.warn(
        `Failed to parse images_url for product ${product.id}:`,
        error,
      );
    }

    return {
      ...product,
      id: product.id.toString(),
      price: product.price ? Number(product.price) : null,
      quantity: product.quantity ? Number(product.quantity) : null,
      imagesUrl,
      generalDescription: product.general_description || '',
      ofCategories: product.product_categories.map((pc) => ({
        id: pc.categories_id.toString(),
        name: pc.category?.name || '',
      })),
    };
  }

  /**
   * Create a new product
   */
  async create(createProductDto: CreateProductDto) {
    const {
      title,
      price,
      quantity,
      categoryIds,
      description,
      imagesUrl,
      generalDescription,
      instruction,
      isFeatured,
      featuredThumbnail,
      recipeThumbnail,
      type,
    } = createProductDto;

    // Validate product type
    const validTypes = [
      'Bột',
      'hàng sãn xuất',
      'Mứt Sốt',
      'Siro',
      'Topping',
      'Khác (Lermao)',
      'Khác (Trà Phượng Hoàng)',
    ];

    if (type && !validTypes.includes(type)) {
      throw new BadRequestException(
        `Invalid product type. Valid types are: ${validTypes.join(', ')}`,
      );
    }

    const product = await this.prisma.product.create({
      data: {
        title,
        price: price ? BigInt(price) : null,
        quantity: BigInt(quantity),
        description,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : null,
        general_description: generalDescription,
        instruction,
        is_featured: isFeatured || false,
        featured_thumbnail: featuredThumbnail,
        recipe_thumbnail: recipeThumbnail,
        type,
        created_date: new Date(),
      },
    });

    // Only allow linking to target categories
    if (categoryIds && categoryIds.length > 0) {
      const targetCategories = await this.prisma.category.findMany({
        where: {
          id: {
            in: categoryIds.map((id) => BigInt(id)),
          },
          name: {
            in: ['Trà Phượng Hoàng', 'Lermao'],
          },
        },
      });

      for (const category of targetCategories) {
        await this.prisma.product_categories.create({
          data: {
            product_id: product.id,
            categories_id: category.id,
          },
        });
      }
    }

    return this.findById(Number(product.id));
  }

  /**
   * Update a product
   */
  async update(id: number, updateProductDto: UpdateProductDto) {
    const productId = BigInt(id);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const {
      title,
      price,
      quantity,
      categoryIds,
      description,
      imagesUrl,
      generalDescription,
      instruction,
      isFeatured,
      featuredThumbnail,
      recipeThumbnail,
      type,
    } = updateProductDto;

    // Validate product type
    const validTypes = [
      'Bột',
      'hàng sãn xuất',
      'Mứt Sốt',
      'Siro',
      'Topping',
      'Khác (Lermao)',
      'Khác (Trà Phượng Hoàng)',
    ];

    if (type && !validTypes.includes(type)) {
      throw new BadRequestException(
        `Invalid product type. Valid types are: ${validTypes.join(', ')}`,
      );
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        title,
        price: price !== undefined ? BigInt(price) : product.price,
        quantity: quantity !== undefined ? BigInt(quantity) : product.quantity,
        description,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : product.images_url,
        general_description: generalDescription,
        instruction,
        is_featured: isFeatured,
        featured_thumbnail: featuredThumbnail,
        recipe_thumbnail: recipeThumbnail,
        type,
        updated_date: new Date(),
      },
    });

    // Update category relationships (only target categories)
    if (categoryIds && categoryIds.length > 0) {
      await this.prisma.product_categories.deleteMany({
        where: { product_id: productId },
      });

      const targetCategories = await this.prisma.category.findMany({
        where: {
          id: {
            in: categoryIds.map((id) => BigInt(id)),
          },
          name: {
            in: ['Trà Phượng Hoàng', 'Lermao'],
          },
        },
      });

      for (const category of targetCategories) {
        await this.prisma.product_categories.create({
          data: {
            product_id: productId,
            categories_id: category.id,
          },
        });
      }
    }

    return this.findById(id);
  }

  /**
   * Delete a product
   */
  async remove(id: number) {
    const productId = BigInt(id);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.prisma.product_categories.deleteMany({
      where: { product_id: productId },
    });

    await this.prisma.product.delete({
      where: { id: productId },
    });

    return { message: `Product with ID ${id} has been deleted` };
  }
}
