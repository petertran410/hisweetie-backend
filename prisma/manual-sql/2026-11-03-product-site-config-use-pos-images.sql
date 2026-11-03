-- Công tắc "Dùng hình ảnh từ POS" theo từng site.
-- Mặc định b'1' = giữ nguyên hành vi hiện tại cho mọi sản phẩm đang có.
-- Chạy file này TRƯỚC khi deploy backend mới (Prisma sẽ SELECT cột này).

ALTER TABLE `product_site_config`
  ADD COLUMN `use_pos_images` BIT(1) NOT NULL DEFAULT b'1' AFTER `images_url`;

-- Kiểm tra: phải trả về 0
SELECT COUNT(*) AS `rows_without_flag`
FROM `product_site_config`
WHERE `use_pos_images` IS NULL;
