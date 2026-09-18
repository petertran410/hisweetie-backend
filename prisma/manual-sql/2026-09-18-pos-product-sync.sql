-- POS product synchronization. This migration is additive and preserves all
-- existing KiotViet and site-specific production data.

ALTER TABLE `product`
  ADD COLUMN `pos_product_id` INT NULL,
  ADD COLUMN `pos_code` VARCHAR(255) NULL,
  ADD COLUMN `pos_name` VARCHAR(500) NULL,
  ADD COLUMN `pos_images` JSON NULL,
  ADD COLUMN `pos_price` DECIMAL(15, 2) NULL,
  ADD COLUMN `pos_is_active` BIT(1) NULL,
  ADD COLUMN `pos_updated_at` DATETIME(6) NULL,
  ADD COLUMN `pos_synced_at` DATETIME(6) NULL;

-- The legacy KiotViet code is the approved initial POS mapping key.
UPDATE `product`
SET `pos_code` = `kiotviet_code`
WHERE `pos_code` IS NULL
  AND `kiotviet_code` IS NOT NULL;

-- Run these checks before creating the unique index. Both queries must return
-- no rows.
SELECT `pos_code`, COUNT(*) AS `duplicate_count`
FROM `product`
WHERE `pos_code` IS NOT NULL
GROUP BY `pos_code`
HAVING COUNT(*) > 1;

SELECT `pos_product_id`, COUNT(*) AS `duplicate_count`
FROM `product`
WHERE `pos_product_id` IS NOT NULL
GROUP BY `pos_product_id`
HAVING COUNT(*) > 1;

ALTER TABLE `product`
  ADD UNIQUE KEY `product_pos_code_key` (`pos_code`),
  ADD UNIQUE KEY `product_pos_product_id_key` (`pos_product_id`);

CREATE TABLE `pos_product_sync_state` (
  `source` VARCHAR(50) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'IDLE',
  `started_at` DATETIME(6) NULL,
  `completed_at` DATETIME(6) NULL,
  `last_successful_at` DATETIME(6) NULL,
  `locked_until` DATETIME(6) NULL,
  `summary` JSON NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`source`)
);
