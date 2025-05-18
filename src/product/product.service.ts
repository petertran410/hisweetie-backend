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

  create(createProductDto: CreateProductDto) {
    return 'This action adds a new product';
  }

  findOne(id: number) {
    return `This action returns a #${id} product`;
  }

  update(id: number, updateProductDto: UpdateProductDto) {
    return `This action updates a #${id} product`;
  }

  remove(id: number) {
    return `This action removes a #${id} product`;
  }
}
