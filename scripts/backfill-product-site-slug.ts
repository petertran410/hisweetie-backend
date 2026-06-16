/**
 * Backfill slug cho product_site_config.
 *
 * Vấn đề: 849 rows/site có slug = '' (chuỗi rỗng) -> vi phạm
 * @@unique([site_code, slug]) vì MariaDB coi '' là giá trị thật
 * (chỉ NULL mới được bỏ qua trong unique constraint).
 *
 * Cách xử lý:
 *  - Với mỗi row slug NULL hoặc '': sinh slug từ title || kiotviet_name.
 *  - base = convertToSlug(tên). Nếu base === '' -> set NULL (constraint bỏ qua).
 *  - Đảm bảo unique TRONG từng site_code: nếu base trùng -> base + '-' + id.
 *  - Idempotent: chạy lại nhiều lần không gây hỏng.
 *
 * Chạy:
 *   npx ts-node scripts/backfill-product-site-slug.ts          # thực thi
 *   npx ts-node scripts/backfill-product-site-slug.ts --dry    # chỉ in, không ghi
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry');

// Đồng bộ với convertToSlug trong product.service.ts / kiotviet.service.ts
function convertToSlug(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[áàảãạâấầẩẫậăắằẳẵặ]/g, 'a')
    .replace(/[éèẻẽẹêếềểễệ]/g, 'e')
    .replace(/[íìỉĩị]/g, 'i')
    .replace(/[óòỏõọôốồổỗộơớờởỡợ]/g, 'o')
    .replace(/[úùủũụưứừửữự]/g, 'u')
    .replace(/[ýỳỷỹỵ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  console.log(`[backfill-slug] mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);

  // 1. Lấy toàn bộ config kèm tên sản phẩm
  const configs = await prisma.product_site_config.findMany({
    select: {
      id: true,
      site_code: true,
      slug: true,
      title: true,
      product: { select: { title: true, kiotviet_name: true } },
    },
    orderBy: { id: 'asc' },
  });

  // 2. Build map slug đã dùng theo từng site (chỉ tính slug hợp lệ, ≠ '' / null)
  const usedBySite = new Map<string, Set<string>>();
  for (const c of configs) {
    if (c.slug && c.slug.trim() !== '') {
      if (!usedBySite.has(c.site_code)) usedBySite.set(c.site_code, new Set());
      usedBySite.get(c.site_code)!.add(c.slug);
    }
  }

  // 3. Xử lý các row cần backfill (slug null hoặc rỗng)
  const updates: { id: bigint; slug: string | null }[] = [];

  for (const c of configs) {
    const needFix = !c.slug || c.slug.trim() === '';
    if (!needFix) continue;

    const source = c.title || c.product?.title || c.product?.kiotviet_name || '';
    const base = convertToSlug(source);

    if (base === '') {
      // Không có nguồn để sinh slug -> NULL (constraint bỏ qua NULL)
      updates.push({ id: c.id, slug: null });
      continue;
    }

    if (!usedBySite.has(c.site_code)) usedBySite.set(c.site_code, new Set());
    const used = usedBySite.get(c.site_code)!;

    // Đảm bảo unique trong site. Ưu tiên base, trùng -> base-{id}, vẫn trùng -> base-{id}-n
    let candidate = base;
    if (used.has(candidate)) {
      candidate = `${base}-${c.id}`;
      let n = 2;
      while (used.has(candidate)) {
        candidate = `${base}-${c.id}-${n}`;
        n++;
      }
    }

    used.add(candidate);
    updates.push({ id: c.id, slug: candidate });
  }

  console.log(`[backfill-slug] tổng config: ${configs.length}`);
  console.log(`[backfill-slug] cần update : ${updates.length}`);
  const nullCount = updates.filter((u) => u.slug === null).length;
  console.log(`[backfill-slug]   -> set NULL: ${nullCount}`);
  console.log(`[backfill-slug]   -> set slug: ${updates.length - nullCount}`);

  if (DRY_RUN) {
    console.log('[backfill-slug] DRY-RUN, mẫu 15 dòng:');
    updates.slice(0, 15).forEach((u) =>
      console.log(`  id=${u.id} -> ${u.slug === null ? 'NULL' : u.slug}`),
    );
    return;
  }

  // 4. Ghi theo batch tuần tự (tránh quá tải connection)
  let done = 0;
  for (const u of updates) {
    await prisma.product_site_config.update({
      where: { id: u.id },
      data: { slug: u.slug },
    });
    done++;
    if (done % 100 === 0) console.log(`[backfill-slug] updated ${done}/${updates.length}`);
  }

  console.log(`[backfill-slug] ✅ Hoàn tất: ${done} rows updated`);
}

main()
  .catch((e) => {
    console.error('[backfill-slug] ❌ Lỗi:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
