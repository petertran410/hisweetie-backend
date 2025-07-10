// src/news/news.service.ts - UPDATED với method getArticleSections()
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { ClientNewsSearchDto } from './dto/client-news-search.dto';
import { PrismaClient } from '@prisma/client';
import { ARTICLE_SECTIONS, NEWS_TYPES } from './constants/news-types.constants';

@Injectable()
export class NewsService {
  prisma = new PrismaClient();

  // THÊM MỚI: Method cho trang "Bài Viết" chính
  async getArticleSections() {
    const sections = await Promise.all(
      ARTICLE_SECTIONS.map(async (section) => {
        const articles = await this.prisma.news.findMany({
          where: { type: section.type },
          take: 3,
          orderBy: { created_date: 'desc' },
        });

        const formattedArticles = articles.map(this.formatNewsForResponse);

        return {
          type: section.type,
          label: section.label,
          slug: section.slug,
          articles: formattedArticles,
          totalCount: await this.prisma.news.count({
            where: { type: section.type },
          }),
        };
      }),
    );

    return {
      sections,
      meta: {
        totalSections: sections.length,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  async findAllForClient(searchDto: ClientNewsSearchDto) {
    const { pageSize = 10, pageNumber = 0, title, type, featured } = searchDto;

    const where: any = {};
    if (title) {
      where.title = { contains: title };
    }
    if (type) {
      where.type = type;
    }
    if (featured === true) {
      where.is_featured = true;
    }

    const totalElements = await this.prisma.news.count({ where });

    // Get filtered and paginated news
    const news = await this.prisma.news.findMany({
      where,
      skip: pageNumber * pageSize,
      take: pageSize,
      orderBy: [{ created_date: 'desc' }],
    });

    // Format response
    const content = news.map(this.formatNewsForResponse);

    return {
      content,
      totalElements,
      pageable: {
        pageNumber,
        pageSize,
      },
    };
  }

  async getFeaturedNews(limit: number = 5, type?: string) {
    const where: any = { is_featured: true };
    if (type) {
      where.type = type;
    }

    const featuredNews = await this.prisma.news.findMany({
      where,
      take: limit,
      orderBy: { created_date: 'desc' },
    });

    return featuredNews.map(this.formatNewsForResponse);
  }

  async getRelatedNews(id: number, limit: number = 4) {
    // First get the current news item to find its type
    const currentNews = await this.prisma.news.findUnique({
      where: { id: BigInt(id) },
      select: { type: true, id: true },
    });

    if (!currentNews) {
      throw new NotFoundException(`News with ID ${id} not found`);
    }

    // Find related news of the same type, excluding the current one
    const relatedNews = await this.prisma.news.findMany({
      where: {
        type: currentNews.type,
        id: { not: BigInt(id) },
      },
      take: limit,
      orderBy: { created_date: 'desc' },
    });

    return relatedNews.map(this.formatNewsForResponse);
  }

  async findOneForClient(id: number) {
    const news = await this.prisma.news.findUnique({
      where: { id: BigInt(id) },
    });

    if (!news) {
      throw new NotFoundException(`News with ID ${id} not found`);
    }

    return this.formatNewsForResponse(news);
  }

  async incrementViewCount(id: number) {
    const news = await this.prisma.news.findUnique({
      where: { id: BigInt(id) },
    });

    if (!news) {
      throw new NotFoundException(`News with ID ${id} not found`);
    }

    // Increment view count
    const updatedNews = await this.prisma.news.update({
      where: { id: BigInt(id) },
      data: { view: (news.view || 0) + 1 },
    });

    return {
      id: updatedNews.id.toString(),
      views: updatedNews.view,
    };
  }

  // Helper method to format news items consistently
  private formatNewsForResponse(news: any) {
    // Parse images_url from JSON string to array
    let imagesUrl = [];
    try {
      imagesUrl = news.images_url ? JSON.parse(news.images_url) : [];
    } catch (error) {
      console.error(`Failed to parse images_url for news ${news.id}:`, error);
    }

    return {
      id: news.id.toString(),
      title: news.title,
      description: news.description,
      htmlContent: news.html_content,
      imagesUrl: imagesUrl,
      createdDate: news.created_date ? news.created_date.toISOString() : null,
      updatedDate: news.updated_date,
      type: news.type,
      viewCount: news.view || 0,
      isFeatured: Boolean(news.is_featured),
    };
  }

  // Existing methods remain the same...
  async create(createNewsDto: CreateNewsDto) {
    const { title, description, htmlContent, imagesUrl, type } = createNewsDto;

    const news = await this.prisma.news.create({
      data: {
        title,
        description,
        html_content: htmlContent,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : null,
        type,
        created_date: new Date(),
      },
    });

    return {
      id: news.id.toString(),
      title: news.title,
      description: news.description,
      htmlContent: news.html_content,
      imagesUrl: imagesUrl || [],
      type: news.type,
      createdDate: news.created_date ? news.created_date.toISOString() : null,
    };
  }

  async findAll(params?: {
    pageSize?: number;
    pageNumber?: number;
    title?: string;
    type?: string;
  }): Promise<any> {
    const { pageSize = 10, pageNumber = 0, title, type } = params || {};

    const where: any = {};
    if (title) {
      where.title = { contains: title };
    }
    if (type) {
      where.type = type;
    }

    const totalElements = await this.prisma.news.count({ where });

    const news = await this.prisma.news.findMany({
      where,
      skip: pageNumber * pageSize,
      take: pageSize,
      orderBy: { created_date: 'desc' },
    });

    const content = news.map((item) => {
      let imagesUrl = [];
      try {
        imagesUrl = item.images_url ? JSON.parse(item.images_url) : [];
      } catch (error) {
        console.error(`Failed to parse images_url for news ${item.id}:`, error);
      }

      return {
        id: item.id.toString(),
        title: item.title,
        description: item.description,
        htmlContent: item.html_content,
        imagesUrl: imagesUrl,
        createdDate: item.created_date ? item.created_date.toISOString() : null,
        updatedDate: item.updated_date,
        type: item.type,
      };
    });

    return {
      content,
      totalElements,
      pageable: {
        pageNumber,
        pageSize,
      },
    };
  }

  async findOne(id: number) {
    const news = await this.prisma.news.findUnique({
      where: {
        id: BigInt(id),
      },
    });

    if (!news) {
      throw new NotFoundException(`News with ID ${id} not found`);
    }

    let imagesUrl = [];
    try {
      imagesUrl = news.images_url ? JSON.parse(news.images_url) : [];
    } catch (error) {
      console.error(`Failed to parse images_url for news ${news.id}:`, error);
    }

    return {
      id: news.id.toString(),
      title: news.title,
      description: news.description,
      htmlContent: news.html_content,
      imagesUrl: imagesUrl,
      createdDate: news.created_date,
      updatedDate: news.updated_date,
      type: news.type,
    };
  }

  async update(id: number, updateNewsDto: UpdateNewsDto) {
    const newsItem = await this.prisma.news.findUnique({
      where: {
        id: BigInt(id),
      },
    });

    if (!newsItem) {
      throw new NotFoundException(`News with ID ${id} not found`);
    }

    const { title, description, htmlContent, imagesUrl, type } = updateNewsDto;

    const updateData: any = {
      updated_date: new Date(),
    };

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (htmlContent !== undefined) updateData.html_content = htmlContent;
    if (imagesUrl !== undefined)
      updateData.images_url = JSON.stringify(imagesUrl);
    if (type !== undefined) updateData.type = type;

    const updatedNews = await this.prisma.news.update({
      where: {
        id: BigInt(id),
      },
      data: updateData,
    });

    let parsedImagesUrl = [];
    try {
      parsedImagesUrl = updatedNews.images_url
        ? JSON.parse(updatedNews.images_url)
        : [];
    } catch (error) {
      console.error(
        `Failed to parse images_url for news ${updatedNews.id}:`,
        error,
      );
    }

    return {
      id: updatedNews.id.toString(),
      title: updatedNews.title,
      description: updatedNews.description,
      htmlContent: updatedNews.html_content,
      imagesUrl: parsedImagesUrl,
      createdDate: updatedNews.created_date,
      updatedDate: updatedNews.updated_date,
      type: updatedNews.type,
    };
  }

  async remove(id: number) {
    const newsId = BigInt(id);

    const news = await this.prisma.news.findUnique({
      where: {
        id,
      },
    });

    if (!news) {
      throw new NotFoundException(`News with ID ${id} not found`);
    }

    await this.prisma.news.delete({
      where: {
        id: newsId,
      },
    });

    return { message: `News with ID ${id} has been deleted` };
  }
}
