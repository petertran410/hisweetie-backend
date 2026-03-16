// src/pages/pages.service.ts - FIXED TypeScript Issues
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

  async create(createPagesDto: CreatePagesDto, siteCode: string = 'dieptra') {
    const existingPage = await this.prisma.pages.findFirst({
      where: { slug: createPagesDto.slug, site_code: siteCode },
    });

    if (existingPage) {
      throw new BadRequestException(
        `Page with slug "${createPagesDto.slug}" already exists for site "${siteCode}"`,
      );
    }

    return this.prisma.pages.create({
      data: {
        ...createPagesDto,
        site_code: siteCode,
        created_date: new Date(),
        updated_date: new Date(),
      },
      include: { parent: true, children: true },
    });
  }

  async findAll(searchDto: SearchPagesDto, siteCode: string = 'dieptra') {
    const {
      pageSize = 10,
      pageNumber = 0,
      title,
      slug,
      parent_id,
      is_active,
    } = searchDto;

    const where: any = { site_code: siteCode };
    if (title) where.title = { contains: title };
    if (slug) where.slug = { contains: slug };
    if (parent_id !== undefined) where.parent_id = parent_id;
    if (is_active !== undefined) where.is_active = is_active;

    const [total, data] = await Promise.all([
      this.prisma.pages.count({ where }),
      this.prisma.pages.findMany({
        where,
        include: { parent: true, children: true },
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

  async findOne(id: number, siteCode: string = 'dieptra') {
    const page = await this.prisma.pages.findUnique({
      where: { id: BigInt(id) },
      include: {
        parent: true,
        children: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
        },
      },
    });

    if (!page) throw new NotFoundException(`Page with ID ${id} not found`);
    if (page.site_code !== siteCode) {
      throw new BadRequestException('Page does not belong to this site');
    }

    return page;
  }

  async findBySlug(slug: string, siteCode: string = 'dieptra') {
    const page = await this.prisma.pages.findFirst({
      where: { slug, site_code: siteCode },
      include: {
        parent: true,
        children: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
        },
      },
    });

    if (!page)
      throw new NotFoundException(
        `Page with slug "${slug}" not found for site "${siteCode}"`,
      );
    return page;
  }

  async update(
    id: number,
    updatePagesDto: UpdatePagesDto,
    siteCode: string = 'dieptra',
  ) {
    const page = await this.prisma.pages.findUnique({
      where: { id: BigInt(id) },
    });
    if (!page) throw new NotFoundException(`Page with ID ${id} not found`);
    if (page.site_code !== siteCode) {
      throw new BadRequestException('Page does not belong to this site');
    }

    return this.prisma.pages.update({
      where: { id: BigInt(id) },
      data: { ...updatePagesDto, updated_date: new Date() },
      include: { parent: true, children: true },
    });
  }

  async remove(id: number, siteCode: string = 'dieptra') {
    const page = await this.prisma.pages.findUnique({
      where: { id: BigInt(id) },
    });
    if (!page) throw new NotFoundException(`Page with ID ${id} not found`);
    if (page.site_code !== siteCode) {
      throw new BadRequestException('Page does not belong to this site');
    }

    await this.prisma.pages.delete({ where: { id: BigInt(id) } });
    return { message: 'Page deleted successfully' };
  }

  // Get hierarchy for sidebar - FIXED parentId type
  async getPageHierarchy(parentSlug?: string) {
    let parentId: bigint | undefined = undefined;

    if (parentSlug) {
      const parent = await this.prisma.pages.findUnique({
        where: { slug: parentSlug },
      });
      if (parent) {
        parentId = parent.id; // This is BigInt from Prisma
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

  // Get pages for client (only active) - FIXED parameter type
  async getForClient(parent_id?: number | undefined) {
    // FIXED: Accept number | undefined
    const parentIdBigInt =
      parent_id !== undefined ? BigInt(parent_id) : undefined; // Convert to BigInt

    return this.prisma.pages.findMany({
      where: {
        parent_id: parentIdBigInt,
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
