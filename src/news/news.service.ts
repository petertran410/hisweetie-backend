import {
  BadRequestException,
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

  async findIdBySlug(slug: string, type: string, siteCode: string = 'dieptra') {
    try {
      const articles = await this.prisma.news.findMany({
        where: { type, site_code: siteCode },
        select: { id: true, title: true },
        orderBy: { created_date: 'desc' },
      });

      const foundArticle = articles.find((article) => {
        const title = article.title || '';
        return convertToSlug(title) === slug;
      });

      if (!foundArticle) {
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
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Lỗi khi tìm bài viết: ${error.message}`,
      );
    }
  }

  async getArticleSections(siteCode: string = 'dieptra') {
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
            where: {
              type,
              is_visible: true,
              site_code: siteCode,
            },
            select: {
              id: true,
              title: true,
              title_en: true,
              title_meta: true,
              description: true,
              description_en: true,
              html_content_en: true,
              images_url: true,
              created_date: true,
              type: true,
            },
            orderBy: { created_date: 'desc' },
            take: 3,
          });

          const formattedArticles = articles.map((article) => ({
            id: Number(article.id),
            title: article.title,
            title_en: article.title_en,
            title_meta: article.title_meta,
            description: article.description,
            description_en: article.description_en,
            imagesUrl: article.images_url ? JSON.parse(article.images_url) : [],
            createdDate: article.created_date,
            type: article.type,
          }));

          return { type, articles: formattedArticles };
        }),
      );

      return sections;
    } catch (error) {
      throw new InternalServerErrorException(
        `Lỗi khi lấy sections: ${error.message}`,
      );
    }
  }

  private formatNewsForResponse = (news: any) => {
    const parseImages = (imagesUrl: any) => {
      if (!imagesUrl) return [];
      if (typeof imagesUrl === 'string') {
        try {
          return JSON.parse(imagesUrl);
        } catch {
          return [];
        }
      }
      return imagesUrl;
    };

    return {
      id: Number(news.id),
      title: news.title || '',
      title_en: news.title_en || '',
      titleMeta: news.title_meta || null,
      description: news.description || '',
      description_en: news.description_en || '',
      htmlContent: news.html_content || '',
      html_content_en: news.html_content_en || '',
      imagesUrl: parseImages(news.images_url),
      embedUrl: news.embed_url || null,
      createdDate: news.created_date
        ? new Date(news.created_date).toISOString()
        : null,
      updatedDate: news.updated_date
        ? new Date(news.updated_date).toISOString()
        : null,
      viewCount: news.view ? Number(news.view) : 0,
      type: news.type || 'NEWS',
      is_visible: news.is_visible !== undefined ? news.is_visible : true,
    };
  };

  async findAllForClient(
    searchDto: ClientNewsSearchDto,
    siteCode: string = 'dieptra',
  ) {
    const { pageSize = 10, pageNumber = 0, title, type, featured } = searchDto;

    const where: any = {
      is_visible: true,
      site_code: siteCode,
    };

    if (title) where.title = { contains: title };
    if (type) where.type = type;
    if (featured === true) where.is_featured = true;

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
      pageable: { pageNumber, pageSize },
    };
  }

  async toggleVisibility(id: number, siteCode: string = 'dieptra') {
    try {
      const existingNews = await this.prisma.news.findUnique({
        where: { id: BigInt(id) },
        select: { id: true, title: true, is_visible: true, site_code: true },
      });

      if (!existingNews)
        throw new NotFoundException(`News with ID ${id} not found`);

      if (existingNews.site_code !== siteCode) {
        throw new BadRequestException(
          `News belongs to site "${existingNews.site_code}"`,
        );
      }

      const newVisibility = !existingNews.is_visible;

      const updatedNews = await this.prisma.news.update({
        where: { id: BigInt(id) },
        data: { is_visible: newVisibility },
        select: { id: true, title: true, is_visible: true },
      });

      return {
        id: Number(updatedNews.id),
        title: updatedNews.title,
        is_visible: updatedNews.is_visible,
        message: `Bài viết "${updatedNews.title}" đã được ${newVisibility ? 'hiển thị' : 'ẩn'}`,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      throw new BadRequestException(
        `Failed to toggle visibility: ${error.message}`,
      );
    }
  }

  async create(createNewsDto: CreateNewsDto, siteCode: string = 'dieptra') {
    try {
      const {
        title,
        title_en,
        description,
        description_en,
        htmlContent,
        html_content_en,
        imagesUrl,
        type,
        embedUrl,
        titleMeta,
      } = createNewsDto;

      const newsData: any = {
        title,
        title_en,
        title_meta: titleMeta,
        description,
        description_en,
        html_content: htmlContent,
        html_content_en: html_content_en,
        images_url: imagesUrl ? JSON.stringify(imagesUrl) : null,
        type: type || 'NEWS',
        embed_url: embedUrl,
        created_date: new Date(),
        updated_date: new Date(),
        is_visible: true,
        site_code: siteCode,
      };

      const news = await this.prisma.news.create({ data: newsData });

      return this.formatNewsForResponse(news);
    } catch (error) {
      throw new BadRequestException(`Failed to create news: ${error.message}`);
    }
  }

  async findAll(
    searchDto: {
      pageSize?: number;
      pageNumber?: number;
      title?: string;
      type?: string;
    },
    siteCode: string = 'dieptra',
  ) {
    const { pageSize = 10, pageNumber = 0, title, type } = searchDto;

    const where: any = { site_code: siteCode };
    if (title) where.title = { contains: title };
    if (type) where.type = type;

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
    };
  }

  async findOne(id: number) {
    const news = await this.prisma.news.findUnique({
      where: { id: BigInt(id) },
    });

    if (!news) throw new NotFoundException(`News with ID ${id} not found`);

    return this.formatNewsForResponse(news);
  }

  async findOneForClient(id: number) {
    const news = await this.prisma.news.findFirst({
      where: {
        id: BigInt(id),
        is_visible: true,
      },
      select: {
        id: true,
        title: true,
        title_en: true,
        title_meta: true,
        description: true,
        description_en: true,
        html_content: true,
        html_content_en: true,
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

  async incrementViewCount(id: number) {
    const existingNews = await this.prisma.news.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, view: true, title: true },
    });

    if (!existingNews) {
      throw new NotFoundException(`News with ID ${id} not found`);
    }

    const currentView = existingNews.view ?? 0;
    const newView = currentView + 1;

    const updatedNews = await this.prisma.news.update({
      where: { id: BigInt(id) },
      data: { view: newView },
      select: { id: true, view: true, title: true },
    });

    console.log(
      `✅ Article "${updatedNews.title}" - View: ${currentView} → ${updatedNews.view}`,
    );

    return {
      message: 'View count incremented successfully',
      oldView: currentView,
      newView: Number(updatedNews.view),
      articleId: Number(updatedNews.id),
    };
  }

  async update(
    id: number,
    updateNewsDto: UpdateNewsDto,
    siteCode: string = 'dieptra',
  ) {
    const existingNews = await this.prisma.news.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existingNews)
      throw new NotFoundException(`News with ID ${id} not found`);

    if (existingNews.site_code !== siteCode) {
      throw new BadRequestException(
        `News belongs to site "${existingNews.site_code}"`,
      );
    }

    const updateData: any = { updated_date: new Date() };

    if (updateNewsDto.title !== undefined)
      updateData.title = updateNewsDto.title;
    if (updateNewsDto.title_en !== undefined)
      updateData.title_en = updateNewsDto.title_en;
    if (updateNewsDto.titleMeta !== undefined)
      updateData.title_meta = updateNewsDto.titleMeta;
    if (updateNewsDto.description !== undefined)
      updateData.description = updateNewsDto.description;
    if (updateNewsDto.description_en !== undefined)
      updateData.description_en = updateNewsDto.description_en;
    if (updateNewsDto.htmlContent !== undefined)
      updateData.html_content = updateNewsDto.htmlContent;
    if (updateNewsDto.html_content_en !== undefined)
      updateData.html_content_en = updateNewsDto.html_content_en;
    if (updateNewsDto.type !== undefined) updateData.type = updateNewsDto.type;
    if (updateNewsDto.embedUrl !== undefined)
      updateData.embed_url = updateNewsDto.embedUrl;
    if (updateNewsDto.imagesUrl !== undefined) {
      updateData.images_url = updateNewsDto.imagesUrl
        ? JSON.stringify(updateNewsDto.imagesUrl)
        : null;
    }

    const updatedNews = await this.prisma.news.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    return this.formatNewsForResponse(updatedNews);
  }

  async remove(id: number, siteCode: string = 'dieptra') {
    const news = await this.prisma.news.findUnique({
      where: { id: BigInt(id) },
    });

    if (!news) throw new NotFoundException(`News with ID ${id} not found`);

    if (news.site_code !== siteCode) {
      throw new BadRequestException(`News belongs to site "${news.site_code}"`);
    }

    await this.prisma.news.delete({ where: { id: BigInt(id) } });
    return { message: 'News deleted successfully' };
  }

  async getFeaturedNews(
    limit: number = 5,
    type?: string,
    siteCode: string = 'dieptra',
  ) {
    const where: any = {
      is_featured: true,
      is_visible: true,
      site_code: siteCode,
    };
    if (type) where.type = type;

    const news = await this.prisma.news.findMany({
      where,
      take: limit,
      orderBy: { created_date: 'desc' },
    });

    return news.map(this.formatNewsForResponse);
  }

  async getRelatedNews(
    currentId: number,
    limit: number = 4,
    siteCode: string = 'dieptra',
  ) {
    const currentNews = await this.prisma.news.findUnique({
      where: { id: BigInt(currentId) },
      select: { type: true, site_code: true },
    });

    if (!currentNews) return [];

    const relatedNews = await this.prisma.news.findMany({
      where: {
        type: currentNews.type,
        id: { not: BigInt(currentId) },
        is_visible: true,
        site_code: siteCode,
      },
      take: limit,
      orderBy: { created_date: 'desc' },
    });

    return relatedNews.map(this.formatNewsForResponse);
  }
}
