import { Injectable } from '@nestjs/common';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { PrismaClient } from '@prisma/client';
import { NewsDTO } from './dto/all-news.dto';

@Injectable()
export class NewsService {
  prisma = new PrismaClient();

  async findAll(): Promise<NewsDTO[]> {
    const getAllNews: NewsDTO[] = await this.prisma.news.findMany();
    return getAllNews;
  }

  async findOne(id: number) {
    const getNewsById = await this.prisma.news.findUnique({
      where: {
        id,
      },
    });

    return getNewsById;
  }

  create(createNewsDto: CreateNewsDto) {
    return 'This action adds a new news';
  }

  update(id: number, updateNewsDto: UpdateNewsDto) {
    return `This action updates a #${id} news`;
  }

  remove(id: number) {
    return `This action removes a #${id} news`;
  }
}
