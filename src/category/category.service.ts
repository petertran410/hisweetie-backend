import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class CategoryService {
  prisma = new PrismaClient();

  postCategory(createCategoryDto: CreateCategoryDto) {
    return 'This action adds a new category';
  }

  async findAll(params: {
    pageSize: number;
    pageNumber: number;
    parentId?: string;
  }) {
    const { pageSize, pageNumber, parentId } = params;

    const where: any = {};
    if (parentId) {
      if (parentId === 'HOME') {
        where.parent_id = null;
      } else {
        where.parent_id = BigInt(parentId);
      }
    }

    const categories = await this.prisma.category.findMany({
      where,
      take: pageSize,
      skip: pageNumber * pageSize,
      orderBy: {
        priority: 'asc',
      },
      include: {
        product_categories: true,
      },
    });

    return categories.map((category) => ({
      id: category.id.toString(),
      name: category.name,
      description: category.description,
      imagesUrl: category.images_url ? JSON.parse(category.images_url) : [],
      parentId: category.parent_id ? category.parent_id.toString() : null,
      priority: category.priority,
    }));
  }

  findOne(id: number) {
    return `This action returns a #${id} category`;
  }

  update(id: number, updateCategoryDto: UpdateCategoryDto) {
    return `This action updates a #${id} category`;
  }

  remove(id: number) {
    return `This action removes a #${id} category`;
  }
}
