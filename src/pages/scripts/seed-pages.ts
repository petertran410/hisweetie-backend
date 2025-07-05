// src/pages/scripts/seed-pages.ts
// Script để tạo dữ liệu mẫu cho các trang chính sách

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SAMPLE_CONTENT = `
<div class="policy-content">
  <h2>Nội dung mẫu</h2>
  <p>Đây là nội dung mẫu cho trang này. Bạn có thể chỉnh sửa nội dung này thông qua CMS.</p>
  
  <h3>Điều khoản chung</h3>
  <ul>
    <li>Điều khoản 1: Mô tả chi tiết về điều khoản</li>
    <li>Điều khoản 2: Mô tả chi tiết về điều khoản</li>
    <li>Điều khoản 3: Mô tả chi tiết về điều khoản</li>
  </ul>
  
  <h3>Quy định</h3>
  <p>Các quy định cụ thể sẽ được mô tả chi tiết ở đây. Nội dung này có thể được cập nhật thông qua hệ thống CMS.</p>
  
  <h3>Liên hệ</h3>
  <p>Nếu có thắc mắc, vui lòng liên hệ:</p>
  <ul>
    <li>Email: info@dieptra.com</li>
    <li>Hotline: 1900 xxxx</li>
    <li>Địa chỉ: [Địa chỉ công ty]</li>
  </ul>
</div>
`;

async function seedPages() {
  try {
    console.log('🌱 Starting to seed pages...');

    // 1. Tạo trang chính "Chính Sách Diệp Trà"
    const mainPage = await prisma.pages.upsert({
      where: { slug: 'chinh-sach-diep-tra' },
      update: {},
      create: {
        slug: 'chinh-sach-diep-tra',
        title: 'Chính Sách Diệp Trà',
        content: `
<div class="main-policy-page">
  <h1>Chính Sách Diệp Trà</h1>
  <p>Chào mừng bạn đến với trang chính sách của Diệp Trà. Tại đây, bạn có thể tìm hiểu về các chính sách, quy định và điều khoản của chúng tôi.</p>
  
  <h2>Thông tin chung</h2>
  <p>Diệp Trà cam kết mang đến cho khách hàng những sản phẩm chất lượng cao và dịch vụ tốt nhất. Các chính sách của chúng tôi được xây dựng nhằm bảo vệ quyền lợi của khách hàng và đảm bảo sự minh bạch trong mọi giao dịch.</p>
  
  <p>Vui lòng chọn mục bạn muốn tìm hiểu từ menu bên trái.</p>
</div>
        `,
        meta_title:
          'Chính Sách Diệp Trà - Thông tin về các chính sách và quy định',
        meta_description:
          'Tìm hiểu về các chính sách bảo mật, mua hàng, thanh toán, giao hàng và các quy định khác của Diệp Trà.',
        display_order: 0,
        is_active: true,
        is_main_page: true,
        created_date: new Date(),
        updated_date: new Date(),
      },
    });

    console.log('✅ Created main page:', mainPage.title);

    // 2. Tạo các trang con
    const childPages = [
      {
        slug: 'chinh-sach-bao-mat',
        title: 'Chính Sách Bảo Mật',
        meta_title: 'Chính Sách Bảo Mật - Diệp Trà',
        meta_description:
          'Tìm hiểu về cách Diệp Trà bảo vệ thông tin cá nhân và dữ liệu của khách hàng.',
        display_order: 1,
        content: SAMPLE_CONTENT.replace('Nội dung mẫu', 'Chính Sách Bảo Mật'),
      },
      {
        slug: 'chinh-sach-mua-hang',
        title: 'Chính Sách Mua Hàng',
        meta_title: 'Chính Sách Mua Hàng - Diệp Trà',
        meta_description:
          'Hướng dẫn chi tiết về quy trình mua hàng, đặt hàng tại Diệp Trà.',
        display_order: 2,
        content: SAMPLE_CONTENT.replace('Nội dung mẫu', 'Chính Sách Mua Hàng'),
      },
      {
        slug: 'chinh-sach-thanh-toan',
        title: 'Chính Sách Thanh Toán',
        meta_title: 'Chính Sách Thanh Toán - Diệp Trà',
        meta_description:
          'Thông tin về các phương thức thanh toán được chấp nhận tại Diệp Trà.',
        display_order: 3,
        content: SAMPLE_CONTENT.replace(
          'Nội dung mẫu',
          'Chính Sách Thanh Toán',
        ),
      },
      {
        slug: 'chinh-sach-giao-hang',
        title: 'Chính Sách Giao Hàng',
        meta_title: 'Chính Sách Giao Hàng - Diệp Trà',
        meta_description:
          'Thông tin về dịch vụ giao hàng, thời gian và phí vận chuyển của Diệp Trà.',
        display_order: 4,
        content: SAMPLE_CONTENT.replace('Nội dung mẫu', 'Chính Sách Giao Hàng'),
      },
      {
        slug: 'chinh-sach-bao-hanh',
        title: 'Chính Sách Bảo Hành',
        meta_title: 'Chính Sách Bảo Hành - Diệp Trà',
        meta_description:
          'Thông tin về chính sách bảo hành sản phẩm tại Diệp Trà.',
        display_order: 5,
        content: SAMPLE_CONTENT.replace('Nội dung mẫu', 'Chính Sách Bảo Hành'),
      },
      {
        slug: 'chinh-sach-doi-hang-tra-hang',
        title: 'Chính Sách Đổi/Trả Hàng',
        meta_title: 'Chính Sách Đổi/Trả Hàng - Diệp Trà',
        meta_description:
          'Hướng dẫn về quy trình đổi trả hàng, hoàn tiền tại Diệp Trà.',
        display_order: 6,
        content: SAMPLE_CONTENT.replace(
          'Nội dung mẫu',
          'Chính Sách Đổi/Trả Hàng',
        ),
      },
      {
        slug: 'dieu-khoan-su-dung',
        title: 'Điều Khoản Sử Dụng',
        meta_title: 'Điều Khoản Sử Dụng - Diệp Trà',
        meta_description:
          'Các điều khoản và quy định khi sử dụng website và dịch vụ của Diệp Trà.',
        display_order: 7,
        content: SAMPLE_CONTENT.replace('Nội dung mẫu', 'Điều Khoản Sử Dụng'),
      },
    ];

    for (const pageData of childPages) {
      const childPage = await prisma.pages.upsert({
        where: { slug: pageData.slug },
        update: {},
        create: {
          ...pageData,
          parent_id: mainPage.id,
          is_active: true,
          is_main_page: false,
          created_date: new Date(),
          updated_date: new Date(),
        },
      });

      console.log('✅ Created child page:', childPage.title);
    }

    console.log('🎉 Pages seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding pages:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Chạy script
seedPages();
