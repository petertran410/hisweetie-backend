-- Đưa 11 cột JSON về đúng kiểu JSON của MySQL cho khớp schema.prisma.
-- Lý do lệch: DB được restore từ dump MariaDB (MariaDB lưu JSON = LONGTEXT + CHECK json_valid).
-- Đã chạy thử chỉ đọc ngày 2026-11-03: 2.298 dòng có dữ liệu, CAST(... AS JSON) không làm khác dòng nào,
-- không có key trùng, không có số > 15 chữ số. Cả 8 bảng là InnoDB (mỗi ALTER: xong hết hoặc không đổi gì).
--
-- Chạy vào giờ ít khách, khi POS KHÔNG đang đồng bộ. Chạy lần lượt từng BƯỚC.

-- ============================================================
-- BƯỚC 1. KIỂM TRA TRƯỚC: dừng lại nếu có kết quả nào khác mô tả
-- ============================================================

-- 1a. status KHÔNG được là 'RUNNING' (IDLE / SUCCESS / PARTIAL / FAILED đều được)
SELECT `source`, `status`, `locked_until` FROM `pos_product_sync_state`;

-- 1b. Mọi dòng phải có invalid = 0
SELECT 'product.kiotviet_images' AS col, COUNT(*) AS invalid FROM `product` WHERE `kiotviet_images` IS NOT NULL AND JSON_VALID(`kiotviet_images`) = 0
UNION ALL SELECT 'product.pos_images', COUNT(*) FROM `product` WHERE `pos_images` IS NOT NULL AND JSON_VALID(`pos_images`) = 0
UNION ALL SELECT 'pos_product_sync_state.summary', COUNT(*) FROM `pos_product_sync_state` WHERE `summary` IS NOT NULL AND JSON_VALID(`summary`) = 0
UNION ALL SELECT 'kiotviet_sync_log.details', COUNT(*) FROM `kiotviet_sync_log` WHERE `details` IS NOT NULL AND JSON_VALID(`details`) = 0
UNION ALL SELECT 'sync_log.details', COUNT(*) FROM `sync_log` WHERE `details` IS NOT NULL AND JSON_VALID(`details`) = 0
UNION ALL SELECT 'pending_orders.order_data', COUNT(*) FROM `pending_orders` WHERE JSON_VALID(`order_data`) = 0
UNION ALL SELECT 'payment_logs.event_data', COUNT(*) FROM `payment_logs` WHERE `event_data` IS NOT NULL AND JSON_VALID(`event_data`) = 0
UNION ALL SELECT 'payment_logs.sepay_response', COUNT(*) FROM `payment_logs` WHERE `sepay_response` IS NOT NULL AND JSON_VALID(`sepay_response`) = 0
UNION ALL SELECT 'payment_webhooks.raw_data', COUNT(*) FROM `payment_webhooks` WHERE JSON_VALID(`raw_data`) = 0
UNION ALL SELECT 'webhook_log.payload', COUNT(*) FROM `webhook_log` WHERE JSON_VALID(`payload`) = 0
UNION ALL SELECT 'webhook_log.headers', COUNT(*) FROM `webhook_log` WHERE `headers` IS NOT NULL AND JSON_VALID(`headers`) = 0;

-- 1c. Phải ra đủ 11 dòng (tên CHECK dùng ở BƯỚC 3)
SELECT tc.`TABLE_NAME`, cc.`CONSTRAINT_NAME`, cc.`CHECK_CLAUSE`
FROM information_schema.CHECK_CONSTRAINTS cc
JOIN information_schema.TABLE_CONSTRAINTS tc
  ON tc.`CONSTRAINT_NAME` = cc.`CONSTRAINT_NAME` AND tc.`CONSTRAINT_SCHEMA` = cc.`CONSTRAINT_SCHEMA`
WHERE cc.`CONSTRAINT_SCHEMA` = DATABASE()
ORDER BY tc.`TABLE_NAME`, cc.`CONSTRAINT_NAME`;

-- ============================================================
-- BƯỚC 2. SAO LƯU: chỉ khoá chính + các cột JSON của bảng có dữ liệu
-- (không dùng CREATE TABLE LIKE: không chép khoá ngoại → không hoàn tác bằng RENAME được)
-- ============================================================
CREATE TABLE `bak_20261103_product` (PRIMARY KEY (`id`))
  SELECT `id`, `kiotviet_images`, `pos_images` FROM `product`;
CREATE TABLE `bak_20261103_payment_logs` (PRIMARY KEY (`id`))
  SELECT `id`, `event_data`, `sepay_response` FROM `payment_logs`;
CREATE TABLE `bak_20261103_webhook_log` (PRIMARY KEY (`id`))
  SELECT `id`, `payload`, `headers` FROM `webhook_log`;
CREATE TABLE `bak_20261103_pos_product_sync_state` (PRIMARY KEY (`source`))
  SELECT `source`, `summary` FROM `pos_product_sync_state`;

-- Kiểm tra: mỗi cặp số phải bằng nhau
SELECT (SELECT COUNT(*) FROM `product`) AS product, (SELECT COUNT(*) FROM `bak_20261103_product`) AS bak_product,
       (SELECT COUNT(*) FROM `payment_logs`) AS payment_logs, (SELECT COUNT(*) FROM `bak_20261103_payment_logs`) AS bak_payment_logs,
       (SELECT COUNT(*) FROM `webhook_log`) AS webhook_log, (SELECT COUNT(*) FROM `bak_20261103_webhook_log`) AS bak_webhook_log,
       (SELECT COUNT(*) FROM `pos_product_sync_state`) AS sync_state, (SELECT COUNT(*) FROM `bak_20261103_pos_product_sync_state`) AS bak_sync_state;

-- ============================================================
-- BƯỚC 3. ĐỔI KIỂU CỘT (bỏ CHECK cũ vì kiểu JSON đã tự kiểm tra hợp lệ)
-- ============================================================
ALTER TABLE `product`
  DROP CHECK `product_chk_1`, DROP CHECK `product_chk_2`,
  MODIFY `kiotviet_images` JSON NULL,
  MODIFY `pos_images` JSON NULL;

ALTER TABLE `payment_logs`
  DROP CHECK `payment_logs_chk_1`, DROP CHECK `payment_logs_chk_2`,
  MODIFY `event_data` JSON NULL,
  MODIFY `sepay_response` JSON NULL;

ALTER TABLE `webhook_log`
  DROP CHECK `webhook_log_chk_1`, DROP CHECK `webhook_log_chk_2`,
  MODIFY `payload` JSON NOT NULL,
  MODIFY `headers` JSON NULL;

ALTER TABLE `pos_product_sync_state`
  DROP CHECK `pos_product_sync_state_chk_1`,
  MODIFY `summary` JSON NULL;

ALTER TABLE `kiotviet_sync_log`
  DROP CHECK `kiotviet_sync_log_chk_1`,
  MODIFY `details` JSON NULL;

ALTER TABLE `sync_log`
  DROP CHECK `sync_log_chk_1`,
  MODIFY `details` JSON NULL;

ALTER TABLE `pending_orders`
  DROP CHECK `pending_orders_chk_1`,
  MODIFY `order_data` JSON NOT NULL;

ALTER TABLE `payment_webhooks`
  DROP CHECK `payment_webhooks_chk_1`,
  MODIFY `raw_data` JSON NOT NULL;

-- ============================================================
-- BƯỚC 4. KIỂM TRA SAU
-- ============================================================

-- 4a. Phải ra 11 dòng, DATA_TYPE = json
SELECT `TABLE_NAME`, `COLUMN_NAME`, `DATA_TYPE`, `IS_NULLABLE`
FROM information_schema.COLUMNS
WHERE `TABLE_SCHEMA` = DATABASE()
  AND (`TABLE_NAME`, `COLUMN_NAME`) IN (
    ('product','kiotviet_images'), ('product','pos_images'),
    ('pos_product_sync_state','summary'), ('kiotviet_sync_log','details'), ('sync_log','details'),
    ('pending_orders','order_data'), ('payment_logs','event_data'), ('payment_logs','sepay_response'),
    ('payment_webhooks','raw_data'), ('webhook_log','payload'), ('webhook_log','headers'))
ORDER BY `TABLE_NAME`, `COLUMN_NAME`;

-- 4b. Giá trị không đổi so với bản sao lưu: mọi số phải = 0
SELECT
  (SELECT COUNT(*) FROM `product` p JOIN `bak_20261103_product` b ON b.`id` = p.`id`
    WHERE NOT (p.`pos_images` <=> CAST(b.`pos_images` AS JSON))
       OR NOT (p.`kiotviet_images` <=> CAST(b.`kiotviet_images` AS JSON))) AS product_diff,
  (SELECT COUNT(*) FROM `payment_logs` p JOIN `bak_20261103_payment_logs` b ON b.`id` = p.`id`
    WHERE NOT (p.`event_data` <=> CAST(b.`event_data` AS JSON))
       OR NOT (p.`sepay_response` <=> CAST(b.`sepay_response` AS JSON))) AS payment_logs_diff,
  (SELECT COUNT(*) FROM `webhook_log` p JOIN `bak_20261103_webhook_log` b ON b.`id` = p.`id`
    WHERE NOT (p.`payload` <=> CAST(b.`payload` AS JSON))
       OR NOT (p.`headers` <=> CAST(b.`headers` AS JSON))) AS webhook_log_diff,
  (SELECT COUNT(*) FROM `pos_product_sync_state` p JOIN `bak_20261103_pos_product_sync_state` b ON b.`source` = p.`source`
    WHERE NOT (p.`summary` <=> CAST(b.`summary` AS JSON))) AS sync_state_diff;

-- ============================================================
-- HOÀN TÁC (CHỈ chạy khi có sự cố) — ví dụ bảng product, các bảng khác làm tương tự
-- ============================================================
-- ALTER TABLE `product`
--   MODIFY `kiotviet_images` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
--   MODIFY `pos_images` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;
-- UPDATE `product` p JOIN `bak_20261103_product` b ON b.`id` = p.`id`
--   SET p.`kiotviet_images` = b.`kiotviet_images`, p.`pos_images` = b.`pos_images`;

-- ============================================================
-- DỌN DẸP (sau vài ngày chạy ổn)
-- ============================================================
-- DROP TABLE `bak_20261103_product`, `bak_20261103_payment_logs`,
--            `bak_20261103_webhook_log`, `bak_20261103_pos_product_sync_state`;
