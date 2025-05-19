import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ProductService {
  prisma = new PrismaClient();

  async search(params: {
    pageSize: number;
    pageNumber: number;
    title?: string;
    type?: string;
  }) {
    const { pageSize, pageNumber, title, type } = params;

    const where = {};
    if (title) {
      where['title'] = { contains: title };
    }
    if (type) {
      where['type'] = type;
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

    const content = products.map((product) => {
      let imagesUrl = [];
      try {
        imagesUrl = product.images_url ? JSON.parse(product.images_url) : [];
      } catch (error) {
        console.log(
          `Failed to parse images_url for product ${product.id}:`,
          error,
        );
      }

      return {
        ...product,
        imagesUrl,
        isFeatured: product.is_featured,
        ofCategories: product.product_categories.map((pc) => ({
          id: pc.categories_id,
          name: pc.category?.name || '',
        })),
      };
    });

    return {
      content,
      totalElements,
      pageable: {
        pageNumber,
        pageSize,
        pageCount: Math.ceil(totalElements / pageSize),
      },
    };
  }

  async findById(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
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
      console.log(
        `Failed to parse images_url for product ${product.id}:`,
        error,
      );
    }

    return {
      ...product,
      imagesUrl,
      generalDescription: product.general_description || '',
      ofCategories: product.product_categories.map((pc) => ({
        id: pc.categories_id,
        name: pc.category?.name || '',
      })),
    };
  }

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

    const product = await this.prisma.product.create({
      data: {
        title,
        price: price || null,
        quantity: quantity,
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

    if (categoryIds && categoryIds.length > 0) {
      for (const categoryId of categoryIds) {
        await this.prisma.product_categories.create({
          data: {
            product_id: product.id,
            categories_id: categoryId,
          },
        });
      }
    }

    return this.findById(Number(product.id));
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: BigInt(id) },
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

    await this.prisma.product.update({
      where: { id: BigInt(id) },
      data: {
        title,
        price: price ?? product.price,
        quantity: quantity ?? product.quantity,
        description: description ?? product.description,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : product.images_url,
        general_description: generalDescription ?? product.general_description,
        instruction: instruction ?? product.instruction,
        is_featured: isFeatured ?? product.is_featured,
        featured_thumbnail: featuredThumbnail ?? product.featured_thumbnail,
        recipe_thumbnail: recipeThumbnail ?? product.recipe_thumbnail,
        type: type ?? product.type,
        updated_date: new Date(),
      },
    });

    if (categoryIds && categoryIds.length > 0) {
      await this.prisma.product_categories.deleteMany({
        where: {
          product_id: BigInt(id),
        },
      });

      for (const categoryId of categoryIds) {
        await this.prisma.product_categories.create({
          data: {
            product_id: BigInt(id),
            categories_id: BigInt(categoryId),
          },
        });
      }
    }

    return this.findById(id);
  }

  remove(id: number) {
    return `This action removes a #${id} product`;
  }
}
