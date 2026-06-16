import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRedirectDto } from './dto/create-redirect.dto';
import { UpdateRedirectDto } from './dto/update-redirect.dto';

@Injectable()
export class RedirectService {
  private readonly logger = new Logger(RedirectService.name);

  constructor(private prisma: PrismaService) {}

  private serialize(redirect: any) {
    return {
      id: Number(redirect.id),
      source_path: redirect.source_path,
      target_path: redirect.target_path,
      status_code: redirect.status_code,
      match_type: redirect.match_type,
      is_active: redirect.is_active,
      note: redirect.note,
      site_code: redirect.site_code,
      created_date: redirect.created_date,
      updated_date: redirect.updated_date,
    };
  }

  // Chuẩn hoá path: trim + bỏ dấu "/" thừa ở cuối (trừ khi là "/").
  private normalizePath(path: string): string {
    if (typeof path !== 'string') return path;
    let p = path.trim();
    if (p.length > 1 && p.endsWith('/')) {
      p = p.replace(/\/+$/, '');
    }
    return p;
  }

  async create(dto: CreateRedirectDto, siteCode: string = 'dieptra') {
    try {
      const source_path = this.normalizePath(dto.source_path);
      const target_path = this.normalizePath(dto.target_path);

      // Mức 1: chặn loop trực tiếp.
      if (source_path === target_path) {
        throw new BadRequestException(
          'source_path và target_path không được trùng nhau',
        );
      }

      // Chặn trùng source trong cùng site (DB cũng có @@unique nhưng báo lỗi rõ ràng hơn ở đây).
      const existing = await this.prisma.url_redirect.findFirst({
        where: { site_code: siteCode, source_path },
      });
      if (existing) {
        throw new BadRequestException(
          `Đường dẫn cũ "${source_path}" đã có redirect cho site "${siteCode}"`,
        );
      }

      const redirect = await this.prisma.url_redirect.create({
        data: {
          source_path,
          target_path,
          status_code: dto.status_code ?? 301,
          match_type: dto.match_type === 'prefix' ? 'prefix' : 'exact',
          is_active: dto.is_active ?? true,
          note: dto.note ?? null,
          site_code: siteCode,
        },
      });

      return {
        success: true,
        data: this.serialize(redirect),
        message: 'Tạo redirect thành công',
      };
    } catch (error) {
      this.logger.error(`Error creating redirect: ${error.message}`);
      throw error;
    }
  }

  async getAll(
    params: { pageSize: number; pageNumber: number; keyword?: string },
    siteCode: string = 'dieptra',
  ) {
    const { pageSize = 10, pageNumber = 0, keyword } = params;

    const where: any = { site_code: siteCode };
    if (keyword) {
      where.OR = [
        { source_path: { contains: keyword } },
        { target_path: { contains: keyword } },
      ];
    }

    const [total, redirects] = await Promise.all([
      this.prisma.url_redirect.count({ where }),
      this.prisma.url_redirect.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: pageNumber * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      content: redirects.map((r) => this.serialize(r)),
      totalElements: total,
      totalPages: Math.ceil(total / pageSize),
      size: pageSize,
      number: pageNumber,
    };
  }

  async findOne(id: number, siteCode: string = 'dieptra') {
    const redirect = await this.prisma.url_redirect.findUnique({
      where: { id: BigInt(id) },
    });

    if (!redirect) {
      throw new NotFoundException(`Redirect với ID ${id} không tồn tại`);
    }

    if (redirect.site_code !== siteCode) {
      throw new BadRequestException('Redirect không thuộc site này');
    }

    return { success: true, data: this.serialize(redirect) };
  }

  async update(
    id: number,
    dto: UpdateRedirectDto,
    siteCode: string = 'dieptra',
  ) {
    try {
      const current = await this.prisma.url_redirect.findUnique({
        where: { id: BigInt(id) },
      });

      if (!current) {
        throw new NotFoundException(`Redirect với ID ${id} không tồn tại`);
      }

      if (current.site_code !== siteCode) {
        throw new BadRequestException('Redirect không thuộc site này');
      }

      const source_path =
        dto.source_path !== undefined
          ? this.normalizePath(dto.source_path)
          : current.source_path;
      const target_path =
        dto.target_path !== undefined
          ? this.normalizePath(dto.target_path)
          : current.target_path;

      // Mức 1: chặn loop trực tiếp.
      if (source_path === target_path) {
        throw new BadRequestException(
          'source_path và target_path không được trùng nhau',
        );
      }

      // Nếu đổi source_path thì kiểm tra trùng với redirect khác cùng site.
      if (source_path !== current.source_path) {
        const dup = await this.prisma.url_redirect.findFirst({
          where: { site_code: siteCode, source_path, NOT: { id: BigInt(id) } },
        });
        if (dup) {
          throw new BadRequestException(
            `Đường dẫn cũ "${source_path}" đã có redirect cho site "${siteCode}"`,
          );
        }
      }

      const redirect = await this.prisma.url_redirect.update({
        where: { id: BigInt(id) },
        data: {
          source_path,
          target_path,
          status_code: dto.status_code ?? current.status_code,
          match_type:
            dto.match_type !== undefined
              ? dto.match_type === 'prefix'
                ? 'prefix'
                : 'exact'
              : current.match_type,
          is_active: dto.is_active ?? current.is_active,
          note: dto.note !== undefined ? dto.note : current.note,
          updated_date: new Date(),
        },
      });

      return {
        success: true,
        data: this.serialize(redirect),
        message: 'Cập nhật redirect thành công',
      };
    } catch (error) {
      this.logger.error(`Error updating redirect: ${error.message}`);
      throw error;
    }
  }

  async remove(id: number, siteCode: string = 'dieptra') {
    const current = await this.prisma.url_redirect.findUnique({
      where: { id: BigInt(id) },
    });

    if (!current) {
      throw new NotFoundException(`Redirect với ID ${id} không tồn tại`);
    }

    if (current.site_code !== siteCode) {
      throw new BadRequestException('Redirect không thuộc site này');
    }

    await this.prisma.url_redirect.delete({ where: { id: BigInt(id) } });

    return { success: true, message: 'Xóa redirect thành công' };
  }

  // Public: trả toàn bộ redirect đang bật của site (middleware client cache + match).
  async getActiveMap(siteCode: string = 'dieptra') {
    const redirects = await this.prisma.url_redirect.findMany({
      where: { site_code: siteCode, is_active: true },
      select: {
        source_path: true,
        target_path: true,
        status_code: true,
        match_type: true,
      },
    });

    return redirects;
  }
}
