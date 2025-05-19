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

  async getAllCategories(params: {
    pageSize: number;
    pageNumber: number;
    parentId?: string;
  }) {
    const { pageSize, pageNumber, parentId } = params;

    const skip =
      (pageNumber - 1) * pageSize > 0 ? (pageNumber - 1) * pageSize : 0;

    const where = {};
    if (parentId) {
      where['parent_id'] = parentId === 'HOME' ? null : BigInt(parentId);
    }

    const categories = await this.prisma.category.findMany({
      where,
      take: pageSize,
      skip: skip,
      orderBy: { priority: 'asc' },
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
