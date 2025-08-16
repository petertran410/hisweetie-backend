import { category } from './../../node_modules/.prisma/client/index.d';
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaClient, Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { KiotVietAuthService } from 'src/auth/kiotviet-auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { async, firstValueFrom } from 'rxjs';

interface KiotProduct {
  id: number;
  code: string;
  barCode?: string;
  name: string;
  fullName: string;
  categoryId?: number;
  categoryName?: string;
  tradeMarkId?: number;
  tradeMarkName?: string;
  type?: number;
  description?: string;
  allowsSale?: boolean;
  hasVariants?: boolean;
  basePrice?: number;
  unit?: string;
  masterProductId?: number;
  masterCode?: string;
  masterUnitId?: number;
  conversionValue?: number;
  weight?: number;
  isLotSerialControl?: boolean;
  isBatchExpireControl?: boolean;
  orderTemplate?: string;
  minQuantity?: number;
  maxQuantity?: number;
  isRewardPoint?: boolean;
  isActive?: boolean;
  retailerId?: number;
  modifiedDate?: string;
  createdDate?: string;

  // Detailed fields from enrichment
  attributes?: Array<{
    productId: number;
    attributeName: string;
    attributeValue: string;
  }>;

  units?: Array<{
    id: number;
    code: string;
    name: string;
    fullName: string;
    unit: string;
    conversionValue: number;
    basePrice: number;
  }>;

  inventories: Array<{
    productId: number;
    productCode?: string;
    productName?: string;
    branchId: number;
    branchName?: string;
    cost: number;
    onHand: number;
    reserved: number;
    lineNumber: number;
    actualReserved?: number;
    minQuantity?: number;
    maxQuantity?: number;
    isActive?: boolean;
    onOrder?: number;
  }>;

  priceBooks?: Array<{
    productId: number;
    priceBookId: number;
    priceBookName: string;
    price: number;
    isActive?: boolean;
    startDate?: string;
    endDate?: string;
  }>;

  images?: Array<{
    image: string;
  }>;

  productSerials?: Array<{
    productId: number;
    serialNumber: string;
    status: number;
    branchId: number;
    quantity?: number;
    createdDate?: string;
    modifiedDate?: string;
  }>;

  productBatchExpires?: Array<{
    productId: number;
    onHand: number;
    batchName: string;
    expireDate?: string;
    fullNameVirgule: string;
    branchId: number;
  }>;

  warranties?: Array<{
    productId: number;
    description?: string;
    numberTime: number;
    timeType: number;
    warrantyType: number;
    createdDate?: string;
    modifiedDate?: string;
  }>;

  productFormulas?: Array<{
    materialId: number;
    materialCode: string;
    materialFullName: string;
    materialName: string;
    quantity: number;
    basePrice: number;
    productId?: number;
  }>;
}

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  public readonly prisma = new PrismaClient();
  private readonly baseUrl: string;
  private readonly PAGE_SIZE = 100;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly authService: KiotVietAuthService,
  ) {
    const baseUrl = this.configService.get<string>('KIOT_BASE_URL');
    if (!baseUrl) {
      throw new Error('KIOT_BASE_URL environment variable is not configured');
    }
    this.baseUrl = baseUrl;
  }

  async syncAllProducts(): Promise<void> {
    let currentItem = 0;
    let processedCount = 0;
    let totalProducts = 0;
    let consecutiveEmptyPages = 0;
    let consecutiveErrorPages = 0;
    let lastValidTotal = 0;
    let processedProductIds = new Set<number>();

    try {
      const MAX_CONSECUTIVE_EMPTY_PAGES = 5;
      const MAX_CONSECUTIVE_ERROR_PAGES = 3;
      const RETRY_DELAY_MS = 2000;
      const MAX_TOTAL_RETRIES = 10;

      let totalRetries = 0;

      while (true) {
        const currentPage = Math.floor(currentItem / this.PAGE_SIZE) + 1;

        if (totalProducts > 0) {
          if (currentItem >= totalProducts) {
            this.logger.log(
              `✅ Pagination complete. Processed ${processedCount}/${totalProducts} products`,
            );
            break;
          }
        }

        try {
          this.logger.log(
            `📄 Fetching page ${currentPage} (items ${currentItem} - ${currentItem + this.PAGE_SIZE - 1})`,
          );

          const response = await this.fetchProductsListWithRetry({
            currentItem,
            pageSize: this.PAGE_SIZE,
            orderBy: 'createdDate',
            orderDirection: 'DESC',
            includeInventory: true,
            includePricebook: true,
            includeSerials: true,
            includeBatchExpires: true,
            includeWarranties: true,
            includeQuantity: true,
            includeMaterial: true,
            includeCombo: true,
          });

          consecutiveErrorPages = 0;

          const { data: products, total } = response;

          if (total !== undefined && total !== null) {
            if (totalProducts === 0) {
              this.logger.log(
                `📊 Total products detected: ${total}. Starting processing...`,
              );
              totalProducts = total;
            } else if (total !== totalProducts && total !== lastValidTotal) {
              this.logger.warn(
                `⚠️ Total count changed: ${totalProducts} → ${total}. Using latest.`,
              );
              totalProducts = total;
            }
            lastValidTotal = total;
          }

          if (!products || products.length === 0) {
            this.logger.warn(
              `⚠️ Empty page received at position ${currentItem}`,
            );
            consecutiveEmptyPages++;

            if (totalProducts > 0 && currentItem >= totalProducts) {
              this.logger.log('✅ Reached end of data (empty page past total)');
              break;
            }

            if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
              this.logger.log(
                `🔚 Stopping after ${consecutiveEmptyPages} consecutive empty pages`,
              );
              break;
            }

            currentItem += this.PAGE_SIZE;
            continue;
          }

          const newProducts = products.filter((product) => {
            if (processedProductIds.has(product.id)) {
              this.logger.debug(
                `⚠️ Duplicate product ID detected: ${product.id} (${product.code})`,
              );
              return false;
            }
            processedProductIds.add(product.id);
            return true;
          });

          if (newProducts.length !== products.length) {
            this.logger.warn(
              `🔄 Filtered out ${products.length - newProducts.length} duplicate products on page ${currentPage}`,
            );
          }

          if (newProducts.length === 0) {
            this.logger.log(
              `⏭️ Skipping page ${currentPage} - all products already processed`,
            );
            currentItem += this.PAGE_SIZE;
            continue;
          }

          // Process products
          this.logger.log(
            `🔄 Processing ${newProducts.length} products from page ${currentPage}...`,
          );

          const productsWithDetails =
            await this.enrichProductsWithDetails(newProducts);
          const savedProducts =
            await this.saveProductsToDatabase(productsWithDetails);

          processedCount += savedProducts.length;
          currentItem += this.PAGE_SIZE;

          if (totalProducts > 0) {
            const completionPercentage = (processedCount / totalProducts) * 100;
            this.logger.log(
              `📈 Progress: ${processedCount}/${totalProducts} (${completionPercentage.toFixed(1)}%)`,
            );

            if (processedCount >= totalProducts) {
              this.logger.log('🎉 All products processed successfully!');
              break;
            }
          }

          consecutiveEmptyPages = 0;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          consecutiveErrorPages++;
          totalRetries++;

          this.logger.error(
            `❌ Page ${currentPage} failed (attempt ${consecutiveErrorPages}/${MAX_CONSECUTIVE_ERROR_PAGES}): ${error.message}`,
          );

          if (
            consecutiveErrorPages >= MAX_CONSECUTIVE_ERROR_PAGES ||
            totalRetries >= MAX_TOTAL_RETRIES
          ) {
            throw new Error(
              `Too many consecutive errors (${consecutiveErrorPages}) or total retries (${totalRetries}). Last error: ${error.message}`,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async fetchProductsListWithRetry(
    params: {
      currentItem?: number;
      pageSize?: number;
      orderBy?: string;
      orderDirection?: string;
      includeInventory?: boolean;
      includePricebook?: boolean;
      includeSerials?: boolean;
      includeBatchExpires?: boolean;
      includeWarranties?: boolean;
      includeRemoveIds?: boolean;
      includeQuantity?: boolean;
      includeMaterial?: boolean;
      includeCombo?: boolean;
    },
    maxRetries: number = 5,
  ): Promise<any> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchProductsList(params);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const delay = 2000 * attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  async fetchProductsList(params: {
    currentItem?: number;
    pageSize?: number;
    orderBy?: string;
    orderDirection?: string;
    includeInventory?: boolean;
    includePricebook?: boolean;
    includeSerials?: boolean;
    includeBatchExpires?: boolean;
    includeWarranties?: boolean;
    includeRemoveIds?: boolean;
    includeQuantity?: boolean;
    includeMaterial?: boolean;
    includeCombo?: boolean;
  }): Promise<any> {
    const headers = await this.authService.getRequestHeaders();

    const queryParams = new URLSearchParams({
      currentItem: (params.currentItem || 0).toString(),
      pageSize: (params.pageSize || this.PAGE_SIZE).toString(),
      orderBy: params.orderBy || 'createdDate',
      orderDirection: params.orderDirection || 'DESC',
      includeInventory: (params.includeInventory || true).toString(),
      includePricebook: (params.includePricebook || true).toString(),
      includeSerials: (params.includeSerials || true).toString(),
      includeBatchExpires: (params.includeBatchExpires || true).toString(),
      includeWarranties: (params.includeWarranties || true).toString(),
      includeRemoveIds: (params.includeRemoveIds || false).toString(),
      includeQuantity: (params.includeQuantity || true).toString(),
      includeMaterial: (params.includeMaterial || true).toString(),
      includeCombo: (params.includeCombo || true).toString(),
    });

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/products?${queryParams}`, {
        headers,
        timeout: 45000,
      }),
    );

    return response.data;
  }

  private async enrichProductsWithDetails(products: any[]): Promise<any[]> {
    this.logger.log(`🔍 Enriching ${products.length} products with details...`);

    const enrichedProducts: any[] = [];

    for (const product of products) {
      try {
        const headers = await this.authService.getRequestHeaders();

        const queryParams = new URLSearchParams({
          includeInventory: 'true',
          includePricebook: 'true',
          includeSerials: 'true',
          includeBatchExpires: 'true',
          includeWarranties: 'true',
          includeQuantity: 'true',
          includeMaterial: 'true',
          includeCombo: 'true',
        });

        const response = await firstValueFrom(
          this.httpService.get(
            `${this.baseUrl}/products/${product.id}?${queryParams}`,
            { headers, timeout: 30000 },
          ),
        );

        if (response.data) {
          enrichedProducts.push(response.data);
        } else {
          enrichedProducts.push(product);
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        this.logger.warn(
          `Failed to enrich product ${product.code}: ${error.message}`,
        );
        enrichedProducts.push(product);
      }
    }

    return enrichedProducts;
  }

  private async saveProductsToDatabase(
    products: KiotProduct[],
  ): Promise<any[]> {
    this.logger.log(`💾 Saving ${products.length} products to database...`);

    const savedProducts: any[] = [];

    for (const productData of products) {
      try {
        const category = await this.prismaService.kiotviet_category.findFirst({
          where: { kiotVietId: productData.categoryId },
          select: { kiotVietId: true, name: true },
        });

        const tradeMark = await this.prismaService.kiotviet_trademark.findFirst(
          {
            where: { kiotviet_id: productData.tradeMarkId },
            select: { kiotviet_id: true, name: true },
          },
        );

        const product = await this.prismaService.product.upsert({
          where: { kiotviet_id: BigInt(productData.id) },
          update: {
            kiotviet_code: productData.code.trim(),
            kiotviet_name: productData.name.trim(),
            kiotviet_category_id: category?.kiotVietId,
            kiotviet_category_name: category?.name,
            kiotviet_trademark_id: tradeMark?.kiotviet_id,
            kiotviet_trademark_name: tradeMark?.name,
            kiotviet_type: productData.type ?? 1,
            kiotviet_price: productData.basePrice
              ? new Prisma.Decimal(productData.basePrice)
              : null,
            kiotviet_description: productData.description?.trim() || null,
            kiotviet_images: productData.images,
            kiotviet_synced_at: new Date(),
          },
          create: {
            kiotviet_id: BigInt(productData.id),
            kiotviet_code: productData.code.trim(),
            kiotviet_name: productData.name.trim(),
            kiotviet_category_id: category?.kiotVietId,
            kiotviet_trademark_id: tradeMark?.kiotviet_id,
            kiotviet_type: productData.type ?? 1,
            kiotviet_price: productData.basePrice
              ? new Prisma.Decimal(productData.basePrice)
              : null,
            kiotviet_description: productData.description?.trim() || null,
            kiotviet_images: productData.images,
            kiotviet_synced_at: new Date(),
          },
        });

        // if (productData.images && productData.images.length > 0) {
        //   const image = productData.images;
        //   await this.prismaService.product.upsert({
        //     where: { kiotviet_id: BigInt(productData.id) },
        //     update: {
        //       kiotviet_images: image.images,
        //     },
        //     create: {
        //       kiotviet_images: image.images,
        //     },
        //   });
        // }

        savedProducts.push(product);
      } catch (error) {
        this.logger.error(
          `❌ Failed to save product ${productData.code}: ${error.message}`,
        );
      }
    }

    this.logger.log(`✅ Saved ${savedProducts.length} products successfully`);
    return savedProducts;
  }

  async search(params: {
    pageSize: number;
    pageNumber: number;
    title?: string;
    type?: number;
    categoryId?: number;
    isFromKiotViet?: boolean;
    includeHidden?: boolean;
  }) {
    try {
      const {
        pageSize,
        pageNumber,
        title,
        type,
        categoryId,
        isFromKiotViet,
        includeHidden = false,
      } = params;

      const skip = pageNumber * pageSize;
      const take = pageSize;

      const where: Prisma.productWhereInput = {};

      if (!includeHidden) {
        where.is_visible = true;
      }

      if (title) {
        where.OR = [
          { title: { contains: title } },
          { kiotviet_name: { contains: title } },
        ];
      }

      if (type !== undefined) {
        where.kiotviet_type = type;
      }

      if (categoryId) {
        where.category_id = BigInt(categoryId);
      }

      if (isFromKiotViet !== undefined) {
        where.is_from_kiotviet = isFromKiotViet;
      }

      // Default order by latest
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
            kiotviet_category: { select: { kiotVietId: true, name: true } },
            kiotviet_trademark: { select: { kiotviet_id: true, name: true } },
          },
        }),
        this.prisma.product.count({ where }),
      ]);

      const transformedProducts = products.map((product) => {
        const transformed = this.transformProduct(product);

        return {
          ...transformed,
          isVisible: product.is_visible === true,
        };
      });

      let statistics = {};
      if (includeHidden) {
        const [visibleCount, hiddenCount, featuredCount] = await Promise.all([
          this.prisma.product.count({ where: { ...where, is_visible: true } }),
          this.prisma.product.count({ where: { ...where, is_visible: false } }),
          this.prisma.product.count({ where: { ...where, is_featured: true } }),
        ]);

        statistics = {
          total,
          visible: visibleCount,
          hidden: hiddenCount,
          featured: featuredCount,
        };
      }

      return {
        content: transformedProducts,
        totalElements: total,
        totalPages: Math.ceil(total / pageSize),
        pageNumber,
        pageSize,
        ...(includeHidden && { statistics }),
      };
    } catch (error) {
      this.logger.error('Failed to search products:', error.message);
      throw new BadRequestException(
        `Failed to search products: ${error.message}`,
      );
    }
  }

  async findById(id: number) {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: BigInt(id) },
        include: {
          category: {
            select: { id: true, name: true, description: true },
          },
          kiotviet_category: {
            select: { kiotVietId: true, name: true, parentId: true },
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

  async getProductsByCategories(params: {
    pageSize: number;
    pageNumber: number;
    categoryId?: number;
    kiotVietCategoryId?: number;
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

      if (categoryId) {
        where.category_id = BigInt(categoryId);
      }

      if (kiotVietCategoryId) {
        where.kiotviet_category_id = kiotVietCategoryId;
      }

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
            kiotviet_category: { select: { kiotVietId: true, name: true } },
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

  private transformProduct(product: any) {
    return {
      id: Number(product.id),
      title: product.title,
      description: product.description,
      generalDescription: product.general_description,
      instruction: product.instruction,
      rate: product.rate,
      isFeatured: product.is_featured === true,
      isVisible: product.is_visible === true,

      imagesUrl: product.images_url ? JSON.parse(product.images_url) : [],
      featuredThumbnail: product.featured_thumbnail,
      recipeThumbnail: product.recipe_thumbnail,

      categoryId: product.category_id ? product.category_id.toString() : null,
      category: product.category,

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

      isFromKiotViet: product.is_from_kiotviet === true,

      reviews: product.review || [],
    };
  }

  async create(createProductDto: CreateProductDto) {
    try {
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
        images_url: imagesUrlString,
        is_from_kiotviet: false,
        kiotviet_price: createProductDto.kiotviet_price
          ? new Prisma.Decimal(createProductDto.kiotviet_price)
          : null,
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
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: BigInt(id) },
      });

      if (!existingProduct) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      if (existingProduct.is_from_kiotviet) {
        this.logger.warn(
          `Updating KiotViet product ${id}. KiotViet fields will be preserved.`,
        );
      }

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
        images_url: imagesUrlString,
        kiotviet_price: updateProductDto.kiotviet_price
          ? new Prisma.Decimal(updateProductDto.kiotviet_price)
          : undefined,
        category: updateProductDto.category_id
          ? {
              connect: { id: BigInt(updateProductDto.category_id) },
            }
          : undefined,
      };

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

  async toggleVisibility(id: number) {
    try {
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: BigInt(id) },
        select: { id: true, title: true, is_visible: true },
      });

      if (!existingProduct) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

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

  async bulkToggleVisibility(productIds: number[], targetVisibility: boolean) {
    try {
      const bigIntIds = productIds.map((id) => BigInt(id));

      const existingProducts = await this.prisma.product.findMany({
        where: { id: { in: bigIntIds } },
        select: { id: true, title: true },
      });

      const foundIds = existingProducts.map((p) => Number(p.id));
      const notFoundIds = productIds.filter((id) => !foundIds.includes(id));

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
    kiotviet_category_id?: number;
    visibilityFilter?: boolean;
  }) {
    try {
      const {
        pageSize,
        pageNumber,
        title,
        kiotviet_category_id,
        visibilityFilter,
      } = params;

      const skip = pageNumber * pageSize;
      const take = pageSize;

      const where: Prisma.productWhereInput = {};

      if (visibilityFilter !== undefined) {
        where.is_visible = visibilityFilter;
      }

      if (title) {
        where.OR = [
          { title: { contains: title } },
          { kiotviet_name: { contains: title } },
        ];
      }

      if (kiotviet_category_id) {
        where.kiotviet_category_id = kiotviet_category_id;
      }

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
            kiotviet_category: { select: { kiotVietId: true, name: true } },
            kiotviet_trademark: { select: { kiotviet_id: true, name: true } },
          },
        }),
        this.prisma.product.count({ where }),
        this.prisma.product.count({
          where: {
            ...where,
            is_visible: true,
          },
        }),
        this.prisma.product.count({
          where: {
            ...where,
            is_visible: false,
          },
        }),
      ]);

      const transformedProducts = products.map((product) => {
        const transformed = this.transformProduct(product);

        return {
          ...transformed,
          isVisible: product.is_visible,
        };
      });

      return {
        content: transformedProducts,
        totalElements: total,
        totalPages: Math.ceil(total / pageSize),
        pageNumber,
        pageSize,
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
