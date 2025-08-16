import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { ClientNewsSearchDto } from './dto/client-news-search.dto';
import { PrismaClient } from '@prisma/client';

const convertToSlug = (str: string): string => {
  if (!str) return '';

  return str
    .toLowerCase()
    .replace(/tri ân/g, 'tri-an')
    .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a')
    .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e')
    .replace(/ì|í|ị|ỉ|ĩ/g, 'i')
    .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o')
    .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u')
    .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

@Injectable()
export class NewsService {
  prisma = new PrismaClient();

  async findIdBySlug(slug: string, type: string) {
    try {
      const articles = await this.prisma.news.findMany({
        where: { type },
        select: { id: true, title: true },
        orderBy: { created_date: 'desc' },
      });

      const foundArticle = articles.find((article) => {
        const title = article.title || '';
        const articleSlug = convertToSlug(title);
        return articleSlug === slug;
      });

      if (!foundArticle) {
        const availableSlugs = articles.map((a) => ({
          title: a.title,
          slug: convertToSlug(a.title || ''),
        }));

        throw new NotFoundException(
          `Không tìm thấy bài viết với slug "${slug}" và type "${type}"`,
        );
      }

      return {
        id: Number(foundArticle.id),
        title: foundArticle.title,
        slug: convertToSlug(foundArticle.title || ''),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Lỗi khi tìm bài viết: ${error.message}`,
      );
    }
  }

  // FIXED: Handle images_url parsing properly
  async getArticleSections() {
    try {
      const articleTypes = [
        'KIEN_THUC_NGUYEN_LIEU',
        'KIEN_THUC_TRA',
        'TREND_PHA_CHE',
        'REVIEW_SAN_PHAM',
        'CONG_THUC_PHA_CHE',
        'NEWS',
      ];

      const sections = await Promise.all(
        articleTypes.map(async (type) => {
          const articles = await this.prisma.news.findMany({
            where: { type },
            select: {
              id: true,
              title: true,
              description: true,
              images_url: true,
              created_date: true,
              type: true,
            },
            orderBy: { created_date: 'desc' },
          });

          const formattedArticles = articles.map((article) => ({
            id: Number(article.id),
            title: article.title,
            description: article.description,
            imagesUrl: article.images_url ? JSON.parse(article.images_url) : [],
            createdDate: article.created_date,
            type: article.type,
          }));

          return {
            type,
            articles: formattedArticles,
          };
        }),
      );

      return sections;
    } catch (error) {
      throw new InternalServerErrorException(
        `Lỗi khi lấy sections: ${error.message}`,
      );
    }
  }

  // EXISTING METHODS - với fix images parsing
  private formatNewsForResponse = (news: any) => {
    let imagesUrl = [];
    try {
      if (news.images_url && news.images_url !== '[]') {
        imagesUrl = JSON.parse(news.images_url);
      }
    } catch (error) {
      console.error(`Failed to parse images_url for news ${news.id}:`, error);
      imagesUrl = [];
    }

    return {
      id: news.id.toString(),
      title: news.title,
      description: news.description,
      htmlContent: news.html_content,
      imagesUrl: Array.isArray(imagesUrl) ? imagesUrl : [],
      embedUrl: news.embed_url || null,
      createdDate: news.created_date
        ? new Date(news.created_date).toISOString()
        : null,
      updatedDate: news.updated_date
        ? new Date(news.updated_date).toISOString()
        : null,
      viewCount: news.view ? Number(news.view) : 0,
      type: news.type || 'NEWS',
    };
  };

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

    const news = await this.prisma.news.findMany({
      where,
      skip: pageNumber * pageSize,
      take: pageSize,
      orderBy: [{ created_date: 'desc' }],
    });

    const content = news.map(this.formatNewsForResponse);

    return {
      content,
      totalElements,
      totalPages: Math.ceil(totalElements / pageSize),
      number: pageNumber,
      size: pageSize,
      pageable: {
        pageNumber,
        pageSize,
      },
    };
  }

  async create(createNewsDto: CreateNewsDto) {
    try {
      const { title, description, htmlContent, imagesUrl, type, embedUrl } =
        createNewsDto;

      const newsData = {
        title,
        description,
        html_content: htmlContent,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : null,
        embed_url: embedUrl || null, // THÊM MỚI
        type,
        created_date: new Date(),
        updated_date: new Date(),
      };

      const newNews = await this.prisma.news.create({
        data: newsData,
      });

      return this.formatNewsForResponse(newNews);
    } catch (error) {
      throw new InternalServerErrorException(
        `Lỗi khi tạo tin tức: ${error.message}`,
      );
    }
  }

  async findAll(params?: {
    pageSize?: number;
    pageNumber?: number;
    title?: string;
    type?: string;
    excludeTypes?: string;
  }) {
    const {
      pageSize = 10,
      pageNumber = 0,
      title,
      type,
      excludeTypes,
    } = params || {};

    const where: any = {};

    if (title) {
      where.title = { contains: title };
    }

    if (type) {
      where.type = type;
    }

    if (excludeTypes) {
      const typesToExclude = excludeTypes.split(',');
      where.type = {
        notIn: typesToExclude,
      };
    }

    const [news, totalElements] = await Promise.all([
      this.prisma.news.findMany({
        where,
        skip: pageNumber * pageSize,
        take: pageSize,
        orderBy: [{ created_date: 'desc' }],
      }),
      this.prisma.news.count({ where }),
    ]);

    return {
      content: news.map(this.formatNewsForResponse),
      totalElements,
      totalPages: Math.ceil(totalElements / pageSize),
      number: pageNumber,
      size: pageSize,
    };
  }

  async findOne(id: number) {
    const news = await this.prisma.news.findUnique({
      where: {
        id: BigInt(id),
      },
      select: {
        id: true,
        title: true,
        description: true,
        html_content: true,
        images_url: true,
        embed_url: true,
        created_date: true,
        updated_date: true,
        view: true,
        type: true,
      },
    });

    if (!news) {
      throw new NotFoundException(`News with ID ${id} not found`);
    }

    return this.formatNewsForResponse(news);
  }

  async findOneForClient(id: number) {
    const news = await this.prisma.news.findUnique({
      where: {
        id: BigInt(id),
      },
      // THÊM select để đảm bảo lấy embed_url
      select: {
        id: true,
        title: true,
        description: true,
        html_content: true,
        images_url: true,
        embed_url: true, // ĐẢM BẢO CÓ DÒNG NÀY
        created_date: true,
        updated_date: true,
        view: true,
        type: true,
      },
    });

    if (!news) {
      throw new NotFoundException(`News with ID ${id} not found`);
    }

    // Increment view count
    await this.prisma.news.update({
      where: { id: BigInt(id) },
      data: { view: { increment: 1 } },
    });

    return this.formatNewsForResponse(news);
  }

  async update(id: number, updateNewsDto: UpdateNewsDto) {
    try {
      const existingNews = await this.prisma.news.findUnique({
        where: { id: BigInt(id) },
      });

      if (!existingNews) {
        throw new NotFoundException(`Không tìm thấy tin tức với ID ${id}`);
      }

      const { title, description, htmlContent, imagesUrl, type, embedUrl } =
        updateNewsDto;

      const updateData: any = {
        updated_date: new Date(),
      };

      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (htmlContent !== undefined) updateData.html_content = htmlContent;
      if (imagesUrl !== undefined)
        updateData.images_url = JSON.stringify(imagesUrl);
      if (embedUrl !== undefined) updateData.embed_url = embedUrl; // THÊM MỚI
      if (type !== undefined) updateData.type = type;

      const updatedNews = await this.prisma.news.update({
        where: { id: BigInt(id) },
        data: updateData,
      });

      return this.formatNewsForResponse(updatedNews);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Lỗi khi cập nhật tin tức: ${error.message}`,
      );
    }
  }

  async remove(id: number) {
    await this.prisma.news.delete({
      where: { id: BigInt(id) },
    });

    return { message: 'News deleted successfully' };
  }

  async incrementViewCount(id: number) {
    await this.prisma.news.update({
      where: { id: BigInt(id) },
      data: { view: { increment: 1 } },
    });

    return { message: 'View count incremented successfully' };
  }

  async getFeaturedNews(limit: number = 5, type?: string) {
    const where: any = { is_featured: true };
    if (type) {
      where.type = type;
    }

    const news = await this.prisma.news.findMany({
      where,
      take: limit,
      orderBy: { created_date: 'desc' },
    });

    return news.map(this.formatNewsForResponse);
  }

  async getRelatedNews(currentId: number, limit: number = 4) {
    const currentNews = await this.prisma.news.findUnique({
      where: { id: BigInt(currentId) },
      select: { type: true },
    });

    if (!currentNews) {
      return [];
    }

    const relatedNews = await this.prisma.news.findMany({
      where: {
        type: currentNews.type,
        id: { not: BigInt(currentId) },
      },
      take: limit,
      orderBy: { created_date: 'desc' },
    });

    return relatedNews.map(this.formatNewsForResponse);
  }
}
