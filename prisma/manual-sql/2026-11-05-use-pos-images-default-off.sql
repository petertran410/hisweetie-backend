-- Tắt "Dùng hình ảnh từ POS" cho MỌI sản phẩm ở cả 2 site (dieptra, lermao)
-- và đổi mặc định sang TẮT cho sản phẩm mới (đồng bộ POS / tạo trong CMS).
-- Khớp với schema.prisma: use_pos_images @default(dbgenerated("b'0'")).
--
-- Hệ quả: sản phẩm không có hình CMS tự upload sẽ không còn hình trên web.
-- Có thể chạy trước khi deploy backend/CMS mới. Chạy lần lượt từng BƯỚC.

-- ============================================================
-- (TUỲ CHỌN) XEM TRƯỚC: số dòng sẽ KHÔNG còn hình nào sau khi tắt, theo từng site
-- (logic giống resolveSiteImages: link POS bị chép vào ô hình CMS không tính là hình CMS)
-- ============================================================
SELECT site_code, COUNT(*) AS tong,
       SUM(JSON_LENGTH(own) = 0 OR JSON_CONTAINS(third, own)) AS se_khong_con_hinh
FROM (
  SELECT sc.site_code,
    CASE WHEN JSON_TYPE(p.pos_images) = 'ARRAY' AND JSON_LENGTH(p.pos_images) > 0 THEN p.pos_images
         WHEN JSON_TYPE(p.kiotviet_images) = 'ARRAY' THEN p.kiotviet_images
         ELSE JSON_ARRAY() END AS third,
    CASE WHEN JSON_VALID(sc.images_url) AND JSON_TYPE(sc.images_url) = 'ARRAY' AND JSON_LENGTH(sc.images_url) > 0
           THEN CAST(sc.images_url AS JSON)
         WHEN JSON_VALID(p.images_url) AND JSON_TYPE(p.images_url) = 'ARRAY'
           THEN CAST(p.images_url AS JSON)
         ELSE JSON_ARRAY() END AS own
  FROM product_site_config sc JOIN product p ON p.id = sc.product_id
) x
GROUP BY site_code;

-- ============================================================
-- BƯỚC 1. SAO LƯU trạng thái công tắc hiện tại (để hoàn tác)
-- ============================================================
CREATE TABLE bak_20261105_use_pos_images (PRIMARY KEY (id))
  SELECT id, use_pos_images FROM product_site_config;

-- Kiểm tra: 2 số phải bằng nhau
SELECT (SELECT COUNT(*) FROM product_site_config) AS goc,
       (SELECT COUNT(*) FROM bak_20261105_use_pos_images) AS sao_luu;

-- ============================================================
-- BƯỚC 2. SẢN PHẨM MỚI: mặc định TẮT (chỉ đổi định nghĩa cột, chạy tức thì)
-- ============================================================
ALTER TABLE product_site_config ALTER COLUMN use_pos_images SET DEFAULT b'0';

-- ============================================================
-- BƯỚC 3. TẮT cho mọi sản phẩm hiện có, cả 2 site
-- ============================================================
UPDATE product_site_config
SET use_pos_images = b'0', updated_date = NOW(6)
WHERE use_pos_images = b'1';

-- ============================================================
-- BƯỚC 4. KIỂM TRA
-- ============================================================
-- 4a. Phải ra 0
SELECT COUNT(*) AS dong_con_bat FROM product_site_config WHERE use_pos_images = b'1';

-- 4b. Cột Default phải là b'0'
SHOW COLUMNS FROM product_site_config LIKE 'use_pos_images';

-- ============================================================
-- HOÀN TÁC (CHỈ chạy khi cần)
-- ============================================================
-- ALTER TABLE product_site_config ALTER COLUMN use_pos_images SET DEFAULT b'1';
-- UPDATE product_site_config sc JOIN bak_20261105_use_pos_images b ON b.id = sc.id
--   SET sc.use_pos_images = b.use_pos_images;

-- ============================================================
-- DỌN DẸP (sau vài ngày chạy ổn)
-- ============================================================
-- DROP TABLE bak_20261105_use_pos_images;
