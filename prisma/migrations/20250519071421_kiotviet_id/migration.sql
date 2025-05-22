-- CreateTable
CREATE TABLE `applicant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NULL,
    `name` VARCHAR(255) NULL,
    `phone_number` VARCHAR(255) NULL,
    `resume_url` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `application` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_by` VARCHAR(255) NULL,
    `created_date` DATETIME(6) NULL,
    `updated_by` VARCHAR(255) NULL,
    `updated_date` DATETIME(6) NULL,
    `note` VARCHAR(255) NULL,
    `status` VARCHAR(255) NULL,
    `applicant_id` INTEGER NULL,
    `job_post_id` INTEGER NULL,

    INDEX `FKqhppc6ebpi0j94530ftuuyldn`(`job_post_id`),
    INDEX `FKrc3gxkxtsq5jqx764drr3wug5`(`applicant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `authority` (
    `id` INTEGER NOT NULL,
    `role` VARCHAR(255) NULL,
    `user_id` VARCHAR(255) NULL,

    INDEX `FKr1wgeo077ok1nr1shx0t70tg8`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_by` VARCHAR(255) NULL,
    `created_date` DATETIME(6) NULL,
    `updated_by` VARCHAR(255) NULL,
    `updated_date` DATETIME(6) NULL,
    `description` LONGTEXT NULL,
    `images_url` LONGTEXT NULL,
    `name` VARCHAR(255) NULL,
    `parent_id` INTEGER NULL,
    `priority` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `code_forgot_pass` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(255) NULL,
    `expire_date` DATETIME(6) NULL,
    `user_id` VARCHAR(255) NULL,

    INDEX `FKapo65ffi8pncggievbnk4qxha`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hibernate_sequence` (
    `next_val` INTEGER NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_post` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_by` VARCHAR(255) NULL,
    `created_date` DATETIME(6) NULL,
    `updated_by` VARCHAR(255) NULL,
    `updated_date` DATETIME(6) NULL,
    `application_deadline` DATE NULL,
    `employment_type` VARCHAR(255) NULL,
    `job_description` LONGTEXT NULL,
    `location` VARCHAR(255) NULL,
    `title` VARCHAR(255) NULL,
    `vacancies` INTEGER NOT NULL,
    `work_mode` VARCHAR(255) NULL,
    `working_hours` LONGTEXT NULL,
    `salary_ranges` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `news` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_by` VARCHAR(255) NULL,
    `created_date` DATETIME(6) NULL,
    `updated_by` VARCHAR(255) NULL,
    `updated_date` DATETIME(6) NULL,
    `description` LONGTEXT NULL,
    `html_content` LONGTEXT NULL,
    `images_url` LONGTEXT NULL,
    `title` VARCHAR(255) NULL,
    `view` INTEGER NULL,
    `user_id` VARCHAR(255) NULL,
    `type` VARCHAR(255) NULL,

    INDEX `FK4538gbwfa03nwr9edl3fdloo9`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_by` VARCHAR(255) NULL,
    `created_date` DATETIME(6) NULL,
    `updated_by` VARCHAR(255) NULL,
    `updated_date` DATETIME(6) NULL,
    `quantity` INTEGER NULL,
    `product_id` INTEGER NULL,
    `product_order_id` INTEGER NULL,

    INDEX `FK787ibr3guwp6xobrpbofnv7le`(`product_id`),
    INDEX `FKt9pocabfq29dvm6ybbygxly7q`(`product_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_by` VARCHAR(255) NULL,
    `created_date` DATETIME(6) NULL,
    `updated_by` VARCHAR(255) NULL,
    `updated_date` DATETIME(6) NULL,
    `description` LONGTEXT NULL,
    `general_description` LONGTEXT NULL,
    `images_url` LONGTEXT NULL,
    `instruction` LONGTEXT NULL,
    `is_featured` BIT(1) NULL,
    `price` INTEGER NULL,
    `quantity` INTEGER NULL,
    `rate` DOUBLE NULL,
    `title` VARCHAR(255) NULL,
    `type` VARCHAR(255) NULL,
    `featured_thumbnail` VARCHAR(255) NULL,
    `recipe_thumbnail` VARCHAR(255) NULL,
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_categories` (
    `product_id` INTEGER NOT NULL,
    `categories_id` INTEGER NOT NULL,

    INDEX `FK86pfomapgvxb87x9nnxuc0pdj`(`categories_id`),
    PRIMARY KEY (`product_id`, `categories_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_by` VARCHAR(255) NULL,
    `created_date` DATETIME(6) NULL,
    `updated_by` VARCHAR(255) NULL,
    `updated_date` DATETIME(6) NULL,
    `address_detail` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `html_content` LONGTEXT NULL,
    `note` VARCHAR(255) NULL,
    `phone_number` VARCHAR(255) NULL,
    `price` INTEGER NULL,
    `quantity` INTEGER NULL,
    `receiver_full_name` VARCHAR(255) NULL,
    `status` VARCHAR(255) NULL,
    `type` VARCHAR(255) NULL,
    `user_id` VARCHAR(255) NULL,

    INDEX `FKa9own0mc8gwle8cckiij9ubsl`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_by` VARCHAR(255) NULL,
    `created_date` DATETIME(6) NULL,
    `updated_by` VARCHAR(255) NULL,
    `updated_date` DATETIME(6) NULL,
    `comment` VARCHAR(255) NULL,
    `rate` INTEGER NULL,
    `product_id` INTEGER NULL,
    `user_id` VARCHAR(255) NULL,

    INDEX `FKiyf57dy48lyiftdrf7y87rnxi`(`user_id`),
    INDEX `FKiyof1sindb9qiqr9o8npj8klt`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(255) NOT NULL,
    `created_by` VARCHAR(255) NULL,
    `created_date` DATETIME(6) NULL,
    `updated_by` VARCHAR(255) NULL,
    `updated_date` DATETIME(6) NULL,
    `address` VARCHAR(255) NULL,
    `ava_url` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `full_name` VARCHAR(255) NULL,
    `is_active` BIT(1) NOT NULL,
    `password` VARCHAR(255) NULL,
    `phone` VARCHAR(255) NULL,

    UNIQUE INDEX `UK_ob8kqyqqgmefl0aco34akdtpe`(`email`),
    UNIQUE INDEX `UK_589idila9li6a4arw1t8ht1gx`(`phone`),
    INDEX `phone`(`phone`, `email`),
    INDEX `userEmailIndex`(`email`),
    INDEX `userPhoneIndex`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `application` ADD CONSTRAINT `FKqhppc6ebpi0j94530ftuuyldn` FOREIGN KEY (`job_post_id`) REFERENCES `job_post`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `application` ADD CONSTRAINT `FKrc3gxkxtsq5jqx764drr3wug5` FOREIGN KEY (`applicant_id`) REFERENCES `applicant`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `authority` ADD CONSTRAINT `FKr1wgeo077ok1nr1shx0t70tg8` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `code_forgot_pass` ADD CONSTRAINT `FKapo65ffi8pncggievbnk4qxha` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `news` ADD CONSTRAINT `FK4538gbwfa03nwr9edl3fdloo9` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `FK787ibr3guwp6xobrpbofnv7le` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `FKt9pocabfq29dvm6ybbygxly7q` FOREIGN KEY (`product_order_id`) REFERENCES `product_order`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `FK86pfomapgvxb87x9nnxuc0pdj` FOREIGN KEY (`categories_id`) REFERENCES `category`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `FKppc5s0f38pgb35a32dlgyhorc` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `product_order` ADD CONSTRAINT `FKa9own0mc8gwle8cckiij9ubsl` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `review` ADD CONSTRAINT `FKiyf57dy48lyiftdrf7y87rnxi` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `review` ADD CONSTRAINT `FKiyof1sindb9qiqr9o8npj8klt` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
