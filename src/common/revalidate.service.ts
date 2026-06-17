import { Injectable, Logger } from '@nestjs/common';

/**
 * Gọi endpoint revalidate của các client (Next.js) sau khi dữ liệu thay đổi,
 * để xả cache route ngay thay vì chờ revalidate theo thời gian.
 *
 * Cấu hình qua ENV (mỗi site 1 URL client, phân tách bằng dấu phẩy nếu nhiều):
 *   REVALIDATE_URL_DIEPTRA=https://www.dieptra.com/api/revalidate
 *   REVALIDATE_URL_LERMAO=https://www.lermao.com/api/revalidate
 *   REVALIDATE_SECRET=...  (khớp NEXT_API_KEY của client)
 *
 * Fire-and-forget: lỗi revalidate KHÔNG làm hỏng request gốc (cache vẫn tự
 * hết hạn theo thời gian như cũ).
 */
@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);

  private getTargets(siteCode: string): string[] {
    const key =
      siteCode === 'dieptra'
        ? 'REVALIDATE_URL_DIEPTRA'
        : siteCode === 'lermao'
          ? 'REVALIDATE_URL_LERMAO'
          : '';
    const raw = key ? process.env[key] : '';
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Không await ở caller — chạy nền, nuốt lỗi.
  revalidateSite(siteCode: string): void {
    const targets = this.getTargets(siteCode);
    if (!targets.length) return;

    const secret = process.env.REVALIDATE_SECRET || '';

    for (const url of targets) {
      void this.fire(url, secret);
    }
  }

  private async fire(url: string, secret: string): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-revalidate-secret': secret,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        this.logger.warn(`Revalidate ${url} trả ${res.status}`);
      }
    } catch (e) {
      this.logger.warn(`Revalidate ${url} lỗi: ${e?.message || e}`);
    }
  }
}
