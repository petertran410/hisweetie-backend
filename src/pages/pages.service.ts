// src/pages/pages.service.ts - FIXED
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreatePagesDto } from './dto/create-pages.dto';
import { UpdatePagesDto } from './dto/update-pages.dto';
import { SearchPagesDto } from './dto/search-pages.dto';

@Injectable()
export class PagesService {
  private prisma = new PrismaClient();

  constructor() {}

  async create(createPagesDto: CreatePagesDto) {
    // Check if slug already exists
    const existingPage = await this.prisma.pages.findUnique({
      where: { slug: createPagesDto.slug },
    });

    if (existingPage) {
      throw new BadRequestException(
        `Page with slug "${createPagesDto.slug}" already exists`,
      );
    }

    return this.prisma.pages.create({
      data: {
        ...createPagesDto,
        created_date: new Date(),
        updated_date: new Date(),
      },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async findAll(searchDto: SearchPagesDto) {
    const {
      pageSize = 10,
      pageNumber = 0,
      title,
      slug,
      parent_id,
      is_active,
    } = searchDto;

    const where: any = {};

    if (title) {
      where.title = { contains: title };
    }

    if (slug) {
      where.slug = { contains: slug };
    }

    if (parent_id !== undefined) {
      where.parent_id = parent_id;
    }

    if (is_active !== undefined) {
      where.is_active = is_active;
    }

    const [total, data] = await Promise.all([
      this.prisma.pages.count({ where }),
      this.prisma.pages.findMany({
        where,
        include: {
          parent: true,
          children: true,
        },
        orderBy: [{ display_order: 'asc' }, { created_date: 'desc' }],
        skip: pageNumber * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      content: data,
      totalElements: total,
      totalPages: Math.ceil(total / pageSize),
      size: pageSize,
      number: pageNumber,
    };
  }

  async findOne(id: number) {
    const page = await this.prisma.pages.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
        },
      },
    });

    if (!page) {
      throw new NotFoundException(`Page with ID ${id} not found`);
    }

    return page;
  }

  async findBySlug(slug: string) {
    const page = await this.prisma.pages.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
        },
      },
    });

    if (!page) {
      throw new NotFoundException(`Page with slug "${slug}" not found`);
    }

    return page;
  }

  async update(id: number, updatePagesDto: UpdatePagesDto) {
    // Check if page exists
    const existingPage = await this.findOne(id);

    // Check slug uniqueness if slug is being updated
    if (updatePagesDto.slug && updatePagesDto.slug !== existingPage.slug) {
      const slugExists = await this.prisma.pages.findUnique({
        where: { slug: updatePagesDto.slug },
      });

      if (slugExists) {
        throw new BadRequestException(
          `Page with slug "${updatePagesDto.slug}" already exists`,
        );
      }
    }

    return this.prisma.pages.update({
      where: { id },
      data: {
        ...updatePagesDto,
        updated_date: new Date(),
      },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async remove(id: number) {
    // Check if page exists
    await this.findOne(id);

    // Check if page has children
    const childrenCount = await this.prisma.pages.count({
      where: { parent_id: id },
    });

    if (childrenCount > 0) {
      throw new BadRequestException('Cannot delete page that has child pages');
    }

    return this.prisma.pages.delete({
      where: { id },
    });
  }

  // Get hierarchy for sidebar
  async getPageHierarchy(parentSlug?: string) {
    let parentId = null;

    if (parentSlug) {
      const parent = await this.prisma.pages.findUnique({
        where: { slug: parentSlug },
      });
      if (parent) {
        parentId = parent.id;
      }
    }

    return this.prisma.pages.findMany({
      where: {
        parent_id: parentId,
        is_active: true,
      },
      include: {
        children: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
        },
      },
      orderBy: { display_order: 'asc' },
    });
  }

  // Get all pages for admin with search
  async getForAdmin(searchDto: SearchPagesDto) {
    return this.findAll(searchDto);
  }

  // Get pages for client (only active)
  async getForClient(parent_id?: number) {
    return this.prisma.pages.findMany({
      where: {
        parent_id,
        is_active: true,
      },
      include: {
        children: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
        },
      },
      orderBy: { display_order: 'asc' },
    });
  }
}
