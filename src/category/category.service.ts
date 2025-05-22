import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class CategoryService {
  prisma = new PrismaClient();

  async postCategory(createCategoryDto: CreateCategoryDto) {
    const { name, description, parentId, imagesUrl, priority } =
      createCategoryDto;

    const category = await this.prisma.category.create({
      data: {
        name,
        description,
        parent_id: parentId ? BigInt(parentId) : null,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : null,
        priority: priority || 0,
        created_date: new Date(),
      },
    });

    return {
      id: category.id.toString(),
      name: category.name,
      description: category.description,
      imagesUrl: category.images_url ? JSON.parse(category.images_url) : [],
      parentId: category.parent_id ? category.parent_id.toString() : null,
      priority: category.priority,
      createdDate: category.created_date,
    };
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

    const parentIds = categories
      .filter((cat) => cat.parent_id !== null)
      .map((cat) => cat.parent_id!);

    let parentMap = {};
    if (parentIds.length > 0) {
      const parentCategories = await this.prisma.category.findMany({
        where: {
          id: {
            in: parentIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });
      parentMap = parentCategories.reduce((acc, parent) => {
        acc[parent.id.toString()] = parent.name;
        return acc;
      }, {});
    }

    return categories.map((category) => {
      const parentId = category.parent_id
        ? category.parent_id.toString()
        : null;

      return {
        id: category.id.toString(),
        name: category.name,
        description: category.description,
        imagesUrl: category.images_url ? JSON.parse(category.images_url) : [],
        parentId: parentId,
        parentName: parentId ? parentMap[parentId] || null : null,
        priority: category.priority,
      };
    });
  }

  async findOne(id: number) {
    if (isNaN(id) || id <= 0) {
      throw new NotFoundException(`Invalid category ID provided`);
    }

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
    const categoryExists = await this.prisma.category.findUnique({
      where: { id: BigInt(id) },
    });

    if (!categoryExists) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const { name, description, imagesUrl } = updateCategoryDto as any;

    const updateData: any = {
      updated_date: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (imagesUrl !== undefined)
      updateData.images_url = JSON.stringify(imagesUrl);

    const updatedCategory = await this.prisma.category.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    return {
      id: updatedCategory.id.toString(),
      name: updatedCategory.name,
      description: updatedCategory.description,
      imagesUrl: updatedCategory.images_url
        ? JSON.parse(updatedCategory.images_url)
        : [],
      parentId: updatedCategory.parent_id
        ? updatedCategory.parent_id.toString()
        : null,
      priority: updatedCategory.priority,
      updatedDate: updatedCategory.updated_date,
    };
  }

  async remove(id: number) {
    const categoryExists = await this.prisma.category.findUnique({
      where: { id: BigInt(id) },
    });

    if (!categoryExists) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const childCategories = await this.prisma.category.findMany({
      where: { parent_id: BigInt(id) },
    });

    if (childCategories.length > 0) {
      throw new Error('Cannot delete category that has child categories');
    }

    await this.prisma.product_categories.deleteMany({
      where: { categories_id: BigInt(id) },
    });

    await this.prisma.category.delete({
      where: { id: BigInt(id) },
    });

    return { message: `Category with ID ${id} has been deleted` };
  }
}
