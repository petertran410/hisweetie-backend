import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  async getAllTestimonials(params: {
    pageSize: number;
    pageNumber: number;
    siteCode: string;
  }) {
    const { pageSize, pageNumber, siteCode } = params;

    const where = {
      site_code: siteCode,
      name: { not: null },
    };

    const [total, items] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: pageNumber * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          review_description: true,
          image: true,
          site_code: true,
        },
      }),
    ]);

    return {
      content: items.map((r) => ({ ...r, id: Number(r.id) })),
      totalElements: total,
      totalPages: Math.ceil(total / pageSize),
      pageNumber,
      pageSize,
    };
  }

  async getTestimonialById(id: number, siteCode: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        name: true,
        review_description: true,
        image: true,
        site_code: true,
      },
    });

    if (!review) throw new NotFoundException('Testimonial not found');
    if (review.site_code !== siteCode) {
      throw new BadRequestException('Testimonial does not belong to this site');
    }

    return { ...review, id: Number(review.id) };
  }

  async createTestimonial(
    data: { name: string; review_description?: string; image?: string },
    siteCode: string,
  ) {
    const review = await this.prisma.review.create({
      data: {
        name: data.name,
        review_description: data.review_description,
        image: data.image,
        site_code: siteCode,
      },
    });

    return { success: true, data: { ...review, id: Number(review.id) } };
  }

  async updateTestimonial(
    id: number,
    data: { name?: string; review_description?: string; image?: string },
    siteCode: string,
  ) {
    const existing = await this.prisma.review.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) throw new NotFoundException('Testimonial not found');
    if (existing.site_code !== siteCode) {
      throw new BadRequestException('Testimonial does not belong to this site');
    }

    const updated = await this.prisma.review.update({
      where: { id: BigInt(id) },
      data: {
        name: data.name,
        review_description: data.review_description,
        image: data.image,
      },
    });

    return { success: true, data: { ...updated, id: Number(updated.id) } };
  }

  async deleteTestimonial(id: number, siteCode: string) {
    const existing = await this.prisma.review.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) throw new NotFoundException('Testimonial not found');
    if (existing.site_code !== siteCode) {
      throw new BadRequestException('Testimonial does not belong to this site');
    }

    await this.prisma.review.delete({ where: { id: BigInt(id) } });
    return { success: true, message: 'Deleted successfully' };
  }

  async getClientTestimonials(siteCode: string) {
    const reviews = await this.prisma.review.findMany({
      where: {
        site_code: siteCode,
        name: { not: null },
      },
      orderBy: { id: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        review_description: true,
        image: true,
      },
    });

    return reviews.map((r) => ({ ...r, id: Number(r.id) }));
  }
}
