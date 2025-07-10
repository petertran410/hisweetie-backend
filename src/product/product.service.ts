// src/product/product.service.ts - FIXED FOR CURRENT SCHEMA
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  public readonly prisma = new PrismaClient();

  constructor() {}

  async search(params: {
    pageSize: number;
    pageNumber: number;
    title?: string;
    type?: number;
    categoryId?: number;
    kiotVietCategoryId?: number;
    isFromKiotViet?: boolean;
    orderBy?: string;
    isDesc?: boolean;
    includeHidden?: boolean;
  }) {
    try {
      const {
        pageSize,
        pageNumber,
        title,
        type,
        categoryId,
        kiotVietCategoryId,
        isFromKiotViet,
        orderBy = 'id',
        isDesc = false,
        includeHidden = false,
      } = params;

      const skip = pageNumber * pageSize;
      const take = pageSize;

      const where: Prisma.productWhereInput = {};

      if (!includeHidden) {
        where.is_visible = true;
      }

      // Search in both title and kiotviet_name
      if (title) {
        where.OR = [
          { title: { contains: title } },
          { kiotviet_name: { contains: title } },
        ];
      }

      if (type) {
        where.kiotviet_type = type;
      }

      if (categoryId) {
        where.category_id = BigInt(categoryId);
      }

      if (kiotVietCategoryId) {
        where.kiotviet_category_id = kiotVietCategoryId;
      }

      if (isFromKiotViet !== undefined) {
        where.is_from_kiotviet = isFromKiotViet;
      }

      // Build orderBy - FIXED to use only existing fields
      const orderByClause: Prisma.productOrderByWithRelationInput = {
        id: 'desc',
      };
      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take,
          orderBy: orderByClause,
          include: {
            category: { select: { id: true, name: true } },
            kiotviet_category: { select: { kiotviet_id: true, name: true } },
            kiotviet_trademark: { select: { kiotviet_id: true, name: true } },
          },
        }),
        this.prisma.product.count({ where }),
      ]);

      const transformedProducts = products.map((product) =>
        this.transformProduct(product),
      );

      return {
        content: transformedProducts,
        totalElements: total,
        totalPages: Math.ceil(total / pageSize),
        pageNumber,
        pageSize,
        filters: {
          includeHidden,
          visibleCount: includeHidden ? undefined : total,
        },
      };
    } catch (error) {
      this.logger.error('Failed to search products:', error.message);
      throw new BadRequestException(
        `Failed to search products: ${error.message}`,
      );
    }
  }

  // ================================
  // ENHANCED FIND BY ID (FIXED)
  // ================================

  async findById(id: number) {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: BigInt(id) },
        include: {
          category: {
            select: { id: true, name: true, description: true },
          },
          kiotviet_category: {
            select: { kiotviet_id: true, name: true, parent_id: true },
          },
          kiotviet_trademark: {
            select: { kiotviet_id: true, name: true },
          },
          review: {
            select: {
              id: true,
              rate: true,
              comment: true,
              user: { select: { full_name: true } },
            },
          },
        },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      return this.transformProduct(product);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to find product ${id}:`, error.message);
      throw new BadRequestException(`Failed to find product: ${error.message}`);
    }
  }

  // ================================
  // GET PRODUCTS BY CATEGORIES (FIXED)
  // ================================

  async getProductsByCategories(params: {
    pageSize: number;
    pageNumber: number;
    categoryId?: number; // Custom category
    kiotVietCategoryId?: number; // KiotViet category
    subCategoryId?: number;
    orderBy?: string;
    isDesc?: boolean;
    title?: string;
    includeHidden?: boolean;
  }) {
    try {
      const {
        pageSize,
        pageNumber,
        categoryId,
        kiotVietCategoryId,
        subCategoryId,
        orderBy = 'id',
        isDesc = false,
        title,
        includeHidden = false,
      } = params;

      const skip = pageNumber * pageSize;
      const take = pageSize;

      const where: Prisma.productWhereInput = {};

      if (!includeHidden) {
        where.is_visible = true;
      }

      // Filter by custom category
      if (categoryId) {
        where.category_id = BigInt(categoryId);
      }

      // Filter by KiotViet category
      if (kiotVietCategoryId) {
        where.kiotviet_category_id = kiotVietCategoryId;
      }

      // Search in titles
      if (title) {
        where.OR = [
          { title: { contains: title } },
          { kiotviet_name: { contains: title } },
        ];
      }

      let orderByClause: Prisma.productOrderByWithRelationInput = {};
      if (orderBy === 'title') {
        orderByClause.title = isDesc ? 'desc' : 'asc';
      } else if (orderBy === 'price') {
        orderByClause.kiotviet_price = isDesc ? 'desc' : 'asc';
      } else {
        orderByClause[orderBy] = isDesc ? 'desc' : 'asc';
      }

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take,
          orderBy: orderByClause,
          include: {
            category: { select: { id: true, name: true } },
            kiotviet_category: { select: { kiotviet_id: true, name: true } },
            kiotviet_trademark: { select: { kiotviet_id: true, name: true } },
          },
        }),
        this.prisma.product.count({ where }),
      ]);

      const transformedProducts = products.map((product) =>
        this.transformProduct(product),
      );

      return {
        content: transformedProducts,
        totalElements: total,
        totalPages: Math.ceil(total / pageSize),
        pageNumber,
        pageSize,
        filters: {
          includeHidden,
          visibleCount: includeHidden ? undefined : total,
          totalCount: includeHidden ? total : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get products by categories:', error.message);
      throw new BadRequestException(`Failed to get products: ${error.message}`);
    }
  }

  // ================================
  // TRANSFORM PRODUCT (FIXED FOR CURRENT SCHEMA)
  // ================================

  private transformProduct(product: any) {
    // FIXED: Only use fields that exist in current schema
    const displayName =
      product.title || product.kiotviet_name || 'Unnamed Product';
    const displayPrice = product.kiotviet_price
      ? Number(product.kiotviet_price)
      : null;

    // Process images - handle both custom and KiotViet images
    let displayImages = [];
    if (product.images_url) {
      try {
        displayImages =
          typeof product.images_url === 'string'
            ? product.images_url.split(',').map((url) => url.trim())
            : product.images_url;
      } catch (e) {
        displayImages = [];
      }
    } else if (product.kiotviet_images) {
      displayImages = Array.isArray(product.kiotviet_images)
        ? product.kiotviet_images
        : [];
    }

    return {
      // Basic fields - FIXED to match current schema
      id: product.id.toString(),
      title: displayName,
      description: product.description,
      general_description: product.general_description,
      instruction: product.instruction,
      price: displayPrice, // FIXED: Use kiotviet_price as main price
      rate: product.rate,
      type: product.type,
      is_featured: product.is_featured,
      is_visible: product.is_visible,

      // Images
      imagesUrl: displayImages,
      featured_thumbnail: product.featured_thumbnail,
      recipe_thumbnail: product.recipe_thumbnail,

      // Category information
      category: product.category,
      categoryId: product.category_id ? product.category_id.toString() : null,

      // KiotViet specific data
      kiotViet: {
        id: product.kiotviet_id ? product.kiotviet_id.toString() : null,
        code: product.kiotviet_code,
        name: product.kiotviet_name,
        price: product.kiotviet_price ? Number(product.kiotviet_price) : null,
        type: product.kiotviet_type,
        images: product.kiotviet_images,
        category: product.kiotviet_category,
        trademark: product.kiotviet_trademark,
        syncedAt: product.kiotviet_synced_at,
      },

      // Metadata
      isFromKiotViet: product.is_from_kiotviet,

      // Relations
      reviews: product.review || [],
    };
  }

  // ================================
  // CRUD OPERATIONS (FIXED)
  // ================================

  async create(createProductDto: CreateProductDto) {
    try {
      // FIXED: Convert images array to string for database
      let imagesUrlString: string | null = null;
      if (createProductDto.images_url) {
        if (Array.isArray(createProductDto.images_url)) {
          imagesUrlString = createProductDto.images_url.join(',');
        } else {
          imagesUrlString = createProductDto.images_url;
        }
      }

      const productData: Prisma.productCreateInput = {
        title: createProductDto.title,
        description: createProductDto.description,
        general_description: createProductDto.general_description,
        instruction: createProductDto.instruction,
        kiotviet_type: createProductDto.type,
        is_featured: createProductDto.is_featured,
        is_visible: createProductDto.is_visible,
        rate: createProductDto.rate,
        featured_thumbnail: createProductDto.featured_thumbnail,
        recipe_thumbnail: createProductDto.recipe_thumbnail,
        images_url: imagesUrlString, // FIXED: Pass as string
        is_from_kiotviet: false, // Mark as custom product
        kiotviet_price: createProductDto.kiotviet_price
          ? new Prisma.Decimal(createProductDto.kiotviet_price)
          : null,
        // Handle category relationship
        category: createProductDto.category_id
          ? {
              connect: { id: BigInt(createProductDto.category_id) },
            }
          : undefined,
      };

      const product = await this.prisma.product.create({
        data: productData,
        include: {
          category: true,
        },
      });

      this.logger.log(
        `Created custom product: ${product.title} (ID: ${product.id})`,
      );
      return this.transformProduct(product);
    } catch (error) {
      this.logger.error('Failed to create product:', error.message);
      throw new BadRequestException(
        `Failed to create product: ${error.message}`,
      );
    }
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    try {
      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: BigInt(id) },
      });

      if (!existingProduct) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      // Warning if trying to update KiotViet product
      if (existingProduct.is_from_kiotviet) {
        this.logger.warn(
          `Updating KiotViet product ${id}. KiotViet fields will be preserved.`,
        );
      }

      // FIXED: Handle images_url conversion
      let imagesUrlString: string | null | undefined = undefined;
      if (updateProductDto.images_url !== undefined) {
        if (updateProductDto.images_url === null) {
          imagesUrlString = null;
        } else if (Array.isArray(updateProductDto.images_url)) {
          imagesUrlString = updateProductDto.images_url.join(',');
        } else {
          imagesUrlString = updateProductDto.images_url;
        }
      }

      // FIXED: Prepare update data without non-existent fields
      const updateData: Prisma.productUpdateInput = {
        title: updateProductDto.title,
        description: updateProductDto.description,
        general_description: updateProductDto.general_description,
        instruction: updateProductDto.instruction,
        kiotviet_type: updateProductDto.type,
        is_featured: updateProductDto.is_featured,
        is_visible: updateProductDto.is_visible,
        rate: updateProductDto.rate,
        featured_thumbnail: updateProductDto.featured_thumbnail,
        recipe_thumbnail: updateProductDto.recipe_thumbnail,
        images_url: imagesUrlString, // FIXED: Pass as string
        kiotviet_price: updateProductDto.kiotviet_price
          ? new Prisma.Decimal(updateProductDto.kiotviet_price)
          : undefined,
        // Handle category relationship
        category: updateProductDto.category_id
          ? {
              connect: { id: BigInt(updateProductDto.category_id) },
            }
          : undefined,
      };

      // Remove undefined values
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const product = await this.prisma.product.update({
        where: { id: BigInt(id) },
        data: updateData,
        include: {
          category: true,
          kiotviet_category: true,
          kiotviet_trademark: true,
        },
      });

      this.logger.log(
        `Updated product: ${product.title || product.kiotviet_name} (ID: ${product.id})`,
      );
      return this.transformProduct(product);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update product ${id}:`, error.message);
      throw new BadRequestException(
        `Failed to update product: ${error.message}`,
      );
    }
  }

  async remove(id: number) {
    try {
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: BigInt(id) },
      });

      if (!existingProduct) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      // Warning if deleting KiotViet product
      if (existingProduct.is_from_kiotviet) {
        this.logger.warn(
          `Deleting KiotViet product ${id}. It will be re-synced on next sync operation.`,
        );
      }

      await this.prisma.product.delete({
        where: { id: BigInt(id) },
      });

      this.logger.log(
        `Deleted product: ${existingProduct.title || existingProduct.kiotviet_name} (ID: ${id})`,
      );
      return { message: `Product ${id} deleted successfully` };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete product ${id}:`, error.message);
      throw new BadRequestException(
        `Failed to delete product: ${error.message}`,
      );
    }
  }

  // ================================
  // UTILITY METHODS (FIXED)
  // ================================

  async getStatistics() {
    try {
      const [
        totalProducts,
        kiotVietProducts,
        customProducts,
        visibleProducts,
        featuredProducts,
      ] = await Promise.all([
        this.prisma.product.count(),
        this.prisma.product.count({ where: { is_from_kiotviet: true } }),
        this.prisma.product.count({ where: { is_from_kiotviet: false } }),
        this.prisma.product.count({ where: { is_visible: true } }),
        this.prisma.product.count({ where: { is_featured: true } }),
      ]);

      return {
        total: totalProducts,
        kiotViet: kiotVietProducts,
        custom: customProducts,
        visible: visibleProducts,
        featured: featuredProducts,
      };
    } catch (error) {
      this.logger.error('Failed to get product statistics:', error.message);
      throw new BadRequestException(
        `Failed to get statistics: ${error.message}`,
      );
    }
  }

  async getKiotVietProductsByTrademark(
    trademarkId: number,
    limit: number = 10,
  ) {
    try {
      const products = await this.prisma.product.findMany({
        where: {
          kiotviet_trademark_id: trademarkId,
          is_from_kiotviet: true,
        },
        take: limit,
        include: {
          kiotviet_category: true,
          kiotviet_trademark: true,
        },
      });

      return products.map((product) => this.transformProduct(product));
    } catch (error) {
      this.logger.error(
        `Failed to get products by trademark ${trademarkId}:`,
        error.message,
      );
      throw new BadRequestException(
        `Failed to get products by trademark: ${error.message}`,
      );
    }
  }

  async bulkUpdateVisibility(productIds: number[], isVisible: boolean) {
    try {
      const result = await this.prisma.product.updateMany({
        where: {
          id: { in: productIds.map((id) => BigInt(id)) },
        },
        data: {
          is_visible: isVisible,
        },
      });

      this.logger.log(
        `Bulk updated visibility for ${result.count} products to ${isVisible}`,
      );
      return { updated: result.count, isVisible };
    } catch (error) {
      this.logger.error('Failed to bulk update visibility:', error.message);
      throw new BadRequestException(
        `Failed to bulk update visibility: ${error.message}`,
      );
    }
  }

  /**
   * Toggle visibility status của một product
   */
  async toggleVisibility(id: number) {
    try {
      // Tìm product hiện tại
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: BigInt(id) },
        select: { id: true, title: true, is_visible: true },
      });

      if (!existingProduct) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      // Toggle visibility
      const newVisibility = !existingProduct.is_visible;

      const updatedProduct = await this.prisma.product.update({
        where: { id: BigInt(id) },
        data: { is_visible: newVisibility },
        select: {
          id: true,
          title: true,
          is_visible: true,
        },
      });

      this.logger.log(`Product ${id} visibility toggled to: ${newVisibility}`);

      return {
        id: Number(updatedProduct.id),
        title: updatedProduct.title,
        is_visible: updatedProduct.is_visible,
        message: `Sản phẩm "${updatedProduct.title}" đã được ${newVisibility ? 'hiển thị' : 'ẩn'}`,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to toggle visibility for product ${id}:`,
        error.message,
      );
      throw new BadRequestException(
        `Failed to toggle visibility: ${error.message}`,
      );
    }
  }

  /**
   * Bulk toggle visibility cho nhiều products
   */
  async bulkToggleVisibility(productIds: number[], targetVisibility: boolean) {
    try {
      const bigIntIds = productIds.map((id) => BigInt(id));

      // Kiểm tra products tồn tại
      const existingProducts = await this.prisma.product.findMany({
        where: { id: { in: bigIntIds } },
        select: { id: true, title: true },
      });

      const foundIds = existingProducts.map((p) => Number(p.id));
      const notFoundIds = productIds.filter((id) => !foundIds.includes(id));

      // Update visibility cho các products tồn tại
      const updateResult = await this.prisma.product.updateMany({
        where: { id: { in: bigIntIds } },
        data: { is_visible: targetVisibility },
      });

      this.logger.log(
        `Bulk updated ${updateResult.count} products visibility to: ${targetVisibility}`,
      );

      return {
        updated: updateResult.count,
        failed: notFoundIds.length,
        notFoundIds: notFoundIds,
        message: `Đã cập nhật ${updateResult.count} sản phẩm ${targetVisibility ? 'hiển thị' : 'ẩn'}${notFoundIds.length > 0 ? `, ${notFoundIds.length} sản phẩm không tìm thấy` : ''}`,
      };
    } catch (error) {
      this.logger.error('Failed to bulk toggle visibility:', error.message);
      throw new BadRequestException(
        `Failed to bulk toggle visibility: ${error.message}`,
      );
    }
  }

  async searchForCMS(params: {
    pageSize: number;
    pageNumber: number;
    title?: string;
    categoryId?: number;
    visibilityFilter?: boolean; // true = chỉ visible, false = chỉ hidden, undefined = tất cả
  }) {
    try {
      const { pageSize, pageNumber, title, categoryId, visibilityFilter } =
        params;

      const skip = pageNumber * pageSize;
      const take = pageSize;

      const where: Prisma.productWhereInput = {};

      // CMS-specific visibility filter
      if (visibilityFilter !== undefined) {
        where.is_visible = visibilityFilter;
      }
      // Nếu visibilityFilter = undefined, lấy tất cả (visible + hidden)

      if (title) {
        where.OR = [
          { title: { contains: title } },
          { kiotviet_name: { contains: title } },
        ];
      }

      if (categoryId) {
        where.category_id = BigInt(categoryId);
      }

      // Default order by latest for CMS
      const orderByClause: Prisma.productOrderByWithRelationInput = {
        id: 'desc',
      };

      const [products, total, visibleCount, hiddenCount] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take,
          orderBy: orderByClause,
          include: {
            category: { select: { id: true, name: true } },
            kiotviet_category: { select: { kiotviet_id: true, name: true } },
            kiotviet_trademark: { select: { kiotviet_id: true, name: true } },
          },
        }),
        this.prisma.product.count({ where }),
        // Count visible products (for CMS stats)
        this.prisma.product.count({
          where: {
            ...where,
            is_visible: true,
          },
        }),
        // Count hidden products (for CMS stats)
        this.prisma.product.count({
          where: {
            ...where,
            is_visible: false,
          },
        }),
      ]);

      const transformedProducts = products.map((product) => {
        const transformed = this.transformProduct(product);
        // ✅ Ensure is_visible is included for CMS
        return {
          ...transformed,
          isVisible: product.is_visible, // Add explicit field for CMS
        };
      });

      return {
        content: transformedProducts,
        totalElements: total,
        totalPages: Math.ceil(total / pageSize),
        pageNumber,
        pageSize,
        // ✅ CMS-specific statistics
        statistics: {
          total,
          visible: visibilityFilter === false ? 0 : visibleCount,
          hidden: visibilityFilter === true ? 0 : hiddenCount,
          visibilityFilter,
        },
      };
    } catch (error) {
      this.logger.error('Failed to search products for CMS:', error.message);
      throw new BadRequestException(
        `Failed to search products for CMS: ${error.message}`,
      );
    }
  }

  /**
   * CMS-specific: Get visibility statistics
   */
  async getVisibilityStatistics() {
    try {
      const [total, visible, hidden, featured, kiotVietProducts] =
        await Promise.all([
          this.prisma.product.count(),
          this.prisma.product.count({ where: { is_visible: true } }),
          this.prisma.product.count({ where: { is_visible: false } }),
          this.prisma.product.count({ where: { is_featured: true } }),
          this.prisma.product.count({ where: { is_from_kiotviet: true } }),
        ]);

      return {
        total,
        visible,
        hidden,
        featured,
        kiotVietProducts,
        customProducts: total - kiotVietProducts,
        visibilityRate: total > 0 ? ((visible / total) * 100).toFixed(1) : '0',
        hiddenRate: total > 0 ? ((hidden / total) * 100).toFixed(1) : '0',
      };
    } catch (error) {
      this.logger.error('Failed to get visibility statistics:', error.message);
      throw new BadRequestException(
        `Failed to get statistics: ${error.message}`,
      );
    }
  }
}
