import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class CategoryService {
  prisma = new PrismaClient();

  postCategory(createCategoryDto: CreateCategoryDto) {
    return 'This action adds a new category';
  }

  async updatePriorities(updateData: any) {
    if (!Array.isArray(updateData)) {
      throw new Error('Expected an array of category priorities');
    }

    const updatePromises = updateData.map(async (item) => {
      const { id, priority } = item;

      return this.prisma.category.update({
        where: { id: BigInt(id) },
        data: { priority: priority },
      });
    });

    await Promise.all(updatePromises);

    return { message: 'Categories prioritized successfully' };
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

  async findOne(id: number) {
    const categoryResult = await this.prisma.category.findUnique({
      where: { id: BigInt(id) },
    });

    if (!categoryResult) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    let parentName: string | null = null;
    if (categoryResult.parent_id) {
      const parentCategoryResult = await this.prisma.category.findUnique({
        where: { id: categoryResult.parent_id },
      });

      if (parentCategoryResult) {
        parentName = parentCategoryResult.name;
      }
    }

    return {
      id: categoryResult.id.toString(),
      name: categoryResult.name,
      description: categoryResult.description,
      imagesUrl: categoryResult.images_url
        ? JSON.parse(categoryResult.images_url)
        : [],
      parentId: categoryResult.parent_id
        ? categoryResult.parent_id.toString()
        : null,
      parentName: parentName,
      priority: categoryResult.priority,
    };
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    return `This action updates a #${id} category`;
  }

  async remove(id: number) {
    return `This action removes a #${id} category`;
  }
}
