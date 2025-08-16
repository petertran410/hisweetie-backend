// src/scripts/seed-pages.js - COMPLETE VERSION
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.pages.deleteMany({});
    const mainPage = await prisma.pages.create({
      data: {
        slug: 'chinh-sach-diep-tra',
        title: 'Chính Sách Diệp Trà',
        content: `
          <div style="padding: 20px; line-height: 1.6;">
            <h1 style="color: #065FD4; margin-bottom: 20px;">Chính Sách Diệp Trà</h1>
            <p style="font-size: 16px; margin-bottom: 16px;">Chào mừng bạn đến với trang chính sách của Diệp Trà. Tại đây, bạn có thể tìm hiểu về các chính sách, quy định và điều khoản của chúng tôi.</p>
            
            <h2 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Thông tin chung</h2>
            <p style="margin-bottom: 16px;">Diệp Trà cam kết mang đến cho khách hàng những sản phẩm chất lượng cao và dịch vụ tốt nhất. Các chính sách của chúng tôi được xây dựng nhằm bảo vệ quyền lợi của khách hàng và đảm bảo sự minh bạch trong mọi giao dịch.</p>
            
            <p style="margin-bottom: 16px;"><strong>Vui lòng chọn mục bạn muốn tìm hiểu từ menu bên trái.</strong></p>
            
            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin-top: 24px;">
              <p style="margin: 0; font-style: italic; color: #666;">💡 Mọi thắc mắc xin liên hệ: <strong>info@dieptra.com</strong> hoặc hotline: <strong>1900 xxxx</strong></p>
            </div>
          </div>
        `,
        meta_title:
          'Chính Sách Diệp Trà - Thông tin về các chính sách và quy định',
        meta_description:
          'Tìm hiểu về các chính sách bảo mật, mua hàng, thanh toán, giao hàng và các quy định khác của Diệp Trà.',
        display_order: 0,
        is_active: true,
        is_main_page: true,
      },
    });

    const childPages = [
      {
        slug: 'chinh-sach-bao-mat',
        title: 'Chính Sách Bảo Mật',
        meta_title: 'Chính Sách Bảo Mật - Diệp Trà',
        meta_description:
          'Tìm hiểu về cách Diệp Trà bảo vệ thông tin cá nhân và dữ liệu của khách hàng.',
        display_order: 1,
        content: `
          <div style="padding: 20px; line-height: 1.6;">
            <h2 style="color: #065FD4; margin-bottom: 20px;">Chính Sách Bảo Mật</h2>
            <p>Diệp Trà cam kết bảo vệ thông tin cá nhân của khách hàng theo các tiêu chuẩn bảo mật cao nhất.</p>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">1. Thu thập thông tin</h3>
            <p>Chúng tôi thu thập các thông tin sau:</p>
            <ul style="margin-left: 20px; margin-bottom: 16px;">
              <li>Họ tên, email, số điện thoại</li>
              <li>Địa chỉ giao hàng</li>
              <li>Thông tin thanh toán (được mã hóa)</li>
              <li>Lịch sử mua hàng</li>
            </ul>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">2. Sử dụng thông tin</h3>
            <p>Thông tin được sử dụng để:</p>
            <ul style="margin-left: 20px; margin-bottom: 16px;">
              <li>Xử lý và giao hàng đơn hàng</li>
              <li>Hỗ trợ khách hàng</li>
              <li>Cải thiện dịch vụ</li>
              <li>Gửi thông tin khuyến mãi (nếu đồng ý)</li>
            </ul>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">3. Bảo vệ thông tin</h3>
            <p>Chúng tôi áp dụng các biện pháp bảo mật tiên tiến bao gồm mã hóa dữ liệu, tường lửa và kiểm soát truy cập nghiêm ngặt.</p>
            
            <div style="background: #e8f4fd; border-left: 4px solid #065FD4; padding: 16px; margin-top: 24px;">
              <p style="margin: 0;"><strong>Cam kết:</strong> Chúng tôi không bao giờ chia sẻ thông tin cá nhân của bạn với bên thứ ba mà không có sự đồng ý của bạn.</p>
            </div>
          </div>
        `,
      },
      {
        slug: 'chinh-sach-mua-hang',
        title: 'Chính Sách Mua Hàng',
        meta_title: 'Chính Sách Mua Hàng - Diệp Trà',
        meta_description:
          'Hướng dẫn chi tiết về quy trình mua hàng, đặt hàng tại Diệp Trà.',
        display_order: 2,
        content: `
          <div style="padding: 20px; line-height: 1.6;">
            <h2 style="color: #065FD4; margin-bottom: 20px;">Chính Sách Mua Hàng</h2>
            <p>Hướng dẫn chi tiết về quy trình mua hàng tại Diệp Trà để đảm bảo trải nghiệm mua sắm tốt nhất.</p>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Quy trình đặt hàng</h3>
            <ol style="margin-left: 20px; margin-bottom: 16px;">
              <li style="margin-bottom: 8px;"><strong>Chọn sản phẩm:</strong> Duyệt và chọn sản phẩm, thêm vào giỏ hàng</li>
              <li style="margin-bottom: 8px;"><strong>Kiểm tra giỏ hàng:</strong> Xem lại sản phẩm và số lượng</li>
              <li style="margin-bottom: 8px;"><strong>Điền thông tin:</strong> Nhập thông tin giao hàng và liên hệ</li>
              <li style="margin-bottom: 8px;"><strong>Chọn thanh toán:</strong> Lựa chọn phương thức thanh toán phù hợp</li>
              <li style="margin-bottom: 8px;"><strong>Xác nhận đơn hàng:</strong> Kiểm tra và hoàn tất đặt hàng</li>
            </ol>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Xác nhận đơn hàng</h3>
            <p>Sau khi đặt hàng thành công, bạn sẽ nhận được:</p>
            <ul style="margin-left: 20px; margin-bottom: 16px;">
              <li>Email xác nhận đơn hàng</li>
              <li>SMS thông báo tình trạng đơn hàng</li>
              <li>Mã đơn hàng để theo dõi</li>
            </ul>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Hủy đơn hàng</h3>
            <p>Bạn có thể hủy đơn hàng trong vòng 2 giờ sau khi đặt hàng bằng cách liên hệ hotline hoặc email.</p>
          </div>
        `,
      },
      {
        slug: 'chinh-sach-thanh-toan',
        title: 'Chính Sách Thanh Toán',
        meta_title: 'Chính Sách Thanh Toán - Diệp Trà',
        meta_description:
          'Thông tin về các phương thức thanh toán được chấp nhận tại Diệp Trà.',
        display_order: 3,
        content: `
          <div style="padding: 20px; line-height: 1.6;">
            <h2 style="color: #065FD4; margin-bottom: 20px;">Chính Sách Thanh Toán</h2>
            <p>Diệp Trà cung cấp nhiều phương thức thanh toán linh hoạt và an toàn cho khách hàng.</p>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Các phương thức thanh toán</h3>
            
            <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
              <h4 style="color: #065FD4; margin-top: 0;">💰 Thanh toán khi nhận hàng (COD)</h4>
              <p style="margin-bottom: 0;">Thanh toán bằng tiền mặt khi nhận hàng. Phí COD: 15,000đ cho đơn hàng dưới 500,000đ.</p>
            </div>
            
            <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
              <h4 style="color: #065FD4; margin-top: 0;">🏦 Chuyển khoản ngân hàng</h4>
              <p style="margin-bottom: 8px;">Chuyển khoản trực tiếp vào tài khoản:</p>
              <ul style="margin-left: 20px; margin-bottom: 0;">
                <li>Ngân hàng: Vietcombank</li>
                <li>Số tài khoản: 1234567890</li>
                <li>Chủ tài khoản: CÔNG TY DIỆP TRÀ</li>
              </ul>
            </div>
            
            <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
              <h4 style="color: #065FD4; margin-top: 0;">📱 Ví điện tử</h4>
              <p style="margin-bottom: 0;">Hỗ trợ thanh toán qua MoMo, ZaloPay, VNPay với ưu đãi đặc biệt.</p>
            </div>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Bảo mật thanh toán</h3>
            <p>Tất cả giao dịch được bảo mật bằng SSL 256-bit và tuân thủ tiêu chuẩn PCI DSS.</p>
          </div>
        `,
      },
      {
        slug: 'chinh-sach-giao-hang',
        title: 'Chính Sách Giao Hàng',
        meta_title: 'Chính Sách Giao Hàng - Diệp Trà',
        meta_description:
          'Thông tin về dịch vụ giao hàng, thời gian và phí vận chuyển của Diệp Trà.',
        display_order: 4,
        content: `
          <div style="padding: 20px; line-height: 1.6;">
            <h2 style="color: #065FD4; margin-bottom: 20px;">Chính Sách Giao Hàng</h2>
            <p>Dịch vụ giao hàng nhanh chóng, đáng tin cậy trên toàn quốc.</p>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Thời gian giao hàng</h3>
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                <thead>
                  <tr style="background: #065FD4; color: white;">
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Khu vực</th>
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Thời gian</th>
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Phí ship</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 12px;">Nội thành TP.HCM</td>
                    <td style="border: 1px solid #ddd; padding: 12px;">1-2 ngày</td>
                    <td style="border: 1px solid #ddd; padding: 12px;">Miễn phí (đơn > 300k)</td>
                  </tr>
                  <tr style="background: #f9f9f9;">
                    <td style="border: 1px solid #ddd; padding: 12px;">Ngoại thành TP.HCM</td>
                    <td style="border: 1px solid #ddd; padding: 12px;">2-3 ngày</td>
                    <td style="border: 1px solid #ddd; padding: 12px;">25,000đ</td>
                  </tr>
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 12px;">Các tỉnh thành khác</td>
                    <td style="border: 1px solid #ddd; padding: 12px;">3-5 ngày</td>
                    <td style="border: 1px solid #ddd; padding: 12px;">35,000đ</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Đóng gói sản phẩm</h3>
            <p>Sản phẩm được đóng gói cẩn thận với vật liệu chống sốc và túi zip bảo quản.</p>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Theo dõi đơn hàng</h3>
            <p>Bạn có thể theo dõi tình trạng đơn hàng qua:</p>
            <ul style="margin-left: 20px;">
              <li>Website với mã đơn hàng</li>
              <li>SMS và email cập nhật</li>
              <li>Hotline: 1900 xxxx</li>
            </ul>
          </div>
        `,
      },
      {
        slug: 'chinh-sach-bao-hanh',
        title: 'Chính Sách Bảo Hành',
        meta_title: 'Chính Sách Bảo Hành - Diệp Trà',
        meta_description:
          'Thông tin về chính sách bảo hành sản phẩm tại Diệp Trà.',
        display_order: 5,
        content: `
          <div style="padding: 20px; line-height: 1.6;">
            <h2 style="color: #065FD4; margin-bottom: 20px;">Chính Sách Bảo Hành</h2>
            <p>Diệp Trà cam kết chất lượng sản phẩm và cung cấp chính sách bảo hành rõ ràng.</p>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Thời gian bảo hành</h3>
            <ul style="margin-left: 20px; margin-bottom: 16px;">
              <li><strong>Sản phẩm bột vị:</strong> 12 tháng kể từ ngày sản xuất</li>
              <li><strong>Topping, mứt:</strong> 6 tháng kể từ ngày sản xuất</li>
              <li><strong>Dụng cụ pha chế:</strong> 24 tháng</li>
            </ul>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Điều kiện bảo hành</h3>
            <ul style="margin-left: 20px; margin-bottom: 16px;">
              <li>Sản phẩm còn trong thời hạn bảo hành</li>
              <li>Có hóa đơn mua hàng hoặc ảnh chụp đơn hàng</li>
              <li>Sản phẩm không có dấu hiệu bị tác động bên ngoài</li>
              <li>Bao bì nguyên vẹn (đối với sản phẩm chưa sử dụng)</li>
            </ul>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Quy trình bảo hành</h3>
            <ol style="margin-left: 20px; margin-bottom: 16px;">
              <li>Liên hệ hotline hoặc email thông báo vấn đề</li>
              <li>Cung cấp thông tin đơn hàng và mô tả vấn đề</li>
              <li>Gửi sản phẩm về (nếu cần thiết)</li>
              <li>Kiểm tra và xử lý trong 3-5 ngày làm việc</li>
              <li>Thay thế hoặc hoàn tiền (nếu không sửa được)</li>
            </ol>
            
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin-top: 24px;">
              <p style="margin: 0;"><strong>Lưu ý:</strong> Bảo hành không áp dụng cho trường hợp sản phẩm hết hạn sử dụng do bảo quản không đúng cách.</p>
            </div>
          </div>
        `,
      },
      {
        slug: 'chinh-sach-doi-hang-tra-hang',
        title: 'Chính Sách Đổi/Trả Hàng',
        meta_title: 'Chính Sách Đổi/Trả Hàng - Diệp Trà',
        meta_description:
          'Hướng dẫn về quy trình đổi trả hàng, hoàn tiền tại Diệp Trà.',
        display_order: 6,
        content: `
          <div style="padding: 20px; line-height: 1.6;">
            <h2 style="color: #065FD4; margin-bottom: 20px;">Chính Sách Đổi/Trả Hàng</h2>
            <p>Chúng tôi hỗ trợ đổi trả hàng một cách linh hoạt để đảm bảo sự hài lòng của khách hàng.</p>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Điều kiện đổi trả</h3>
            <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 16px; margin-bottom: 16px;">
              <h4 style="color: #155724; margin-top: 0;">✅ Được chấp nhận đổi trả:</h4>
              <ul style="margin-left: 20px; margin-bottom: 0;">
                <li>Trong vòng 7 ngày kể từ ngày nhận hàng</li>
                <li>Sản phẩm còn nguyên vẹn, chưa qua sử dụng</li>
                <li>Có hóa đơn mua hàng</li>
                <li>Sản phẩm giao sai, thiếu hoặc bị lỗi</li>
              </ul>
            </div>
            
            <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 16px; margin-bottom: 16px;">
              <h4 style="color: #721c24; margin-top: 0;">❌ Không chấp nhận đổi trả:</h4>
              <ul style="margin-left: 20px; margin-bottom: 0;">
                <li>Sản phẩm đã qua sử dụng</li>
                <li>Quá thời hạn 7 ngày</li>
                <li>Sản phẩm bị hỏng do lỗi của khách hàng</li>
                <li>Sản phẩm không còn tem niêm phong</li>
              </ul>
            </div>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Quy trình đổi trả</h3>
            <ol style="margin-left: 20px; margin-bottom: 16px;">
              <li><strong>Liên hệ:</strong> Gọi hotline hoặc email trong vòng 7 ngày</li>
              <li><strong>Đăng ký:</strong> Cung cấp mã đơn hàng và lý do đổi trả</li>
              <li><strong>Gửi hàng:</strong> Đóng gói và gửi sản phẩm về địa chỉ chỉ định</li>
              <li><strong>Kiểm tra:</strong> Chúng tôi kiểm tra trong 2-3 ngày làm việc</li>
              <li><strong>Xử lý:</strong> Đổi sản phẩm mới hoặc hoàn tiền</li>
            </ol>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">Phí đổi trả</h3>
            <ul style="margin-left: 20px; margin-bottom: 16px;">
              <li><strong>Miễn phí:</strong> Nếu lỗi từ phía Diệp Trà</li>
              <li><strong>Khách hàng chịu:</strong> Phí ship 2 chiều nếu đổi ý</li>
              <li><strong>Hoàn tiền:</strong> Trong vòng 5-7 ngày làm việc</li>
            </ul>
          </div>
        `,
      },
      {
        slug: 'dieu-khoan-su-dung',
        title: 'Điều Khoản Sử Dụng',
        meta_title: 'Điều Khoản Sử Dụng - Diệp Trà',
        meta_description:
          'Các điều khoản và quy định khi sử dụng website và dịch vụ của Diệp Trà.',
        display_order: 7,
        content: `
          <div style="padding: 20px; line-height: 1.6;">
            <h2 style="color: #065FD4; margin-bottom: 20px;">Điều Khoản Sử Dụng</h2>
            <p>Bằng việc sử dụng website và dịch vụ của Diệp Trà, bạn đồng ý tuân thủ các điều khoản sau đây.</p>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">1. Quy định chung</h3>
            <ul style="margin-left: 20px; margin-bottom: 16px;">
              <li>Website chỉ dành cho mục đích thương mại hợp pháp</li>
              <li>Người dùng phải từ 18 tuổi trở lên hoặc có sự đồng ý của người giám hộ</li>
              <li>Thông tin cung cấp phải chính xác và đầy đủ</li>
              <li>Không được sử dụng website cho mục đích bất hợp pháp</li>
            </ul>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">2. Quyền và nghĩa vụ của khách hàng</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
              <div style="background: #e8f4fd; padding: 16px; border-radius: 8px;">
                <h4 style="color: #065FD4; margin-top: 0;">Quyền lợi</h4>
                <ul style="margin-left: 16px; margin-bottom: 0;">
                  <li>Được cung cấp thông tin chính xác</li>
                  <li>Được bảo mật thông tin cá nhân</li>
                  <li>Được hỗ trợ khi có vấn đề</li>
                  <li>Được đổi trả theo chính sách</li>
                </ul>
              </div>
              <div style="background: #fff3cd; padding: 16px; border-radius: 8px;">
                <h4 style="color: #856404; margin-top: 0;">Nghĩa vụ</h4>
                <ul style="margin-left: 16px; margin-bottom: 0;">
                  <li>Cung cấp thông tin đúng sự thật</li>
                  <li>Thanh toán đầy đủ và đúng hạn</li>
                  <li>Tuân thủ quy định của website</li>
                  <li>Không spam hoặc gửi nội dung xấu</li>
                </ul>
              </div>
            </div>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">3. Sở hữu trí tuệ</h3>
            <p>Tất cả nội dung trên website bao gồm hình ảnh, văn bản, logo đều thuộc quyền sở hữu của Diệp Trà và được bảo vệ bởi luật pháp.</p>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">4. Giới hạn trách nhiệm</h3>
            <p>Diệp Trà không chịu trách nhiệm cho:</p>
            <ul style="margin-left: 20px; margin-bottom: 16px;">
              <li>Thiệt hại gián tiếp do việc sử dụng sản phẩm</li>
              <li>Gián đoạn dịch vụ do sự cố kỹ thuật</li>
              <li>Thông tin từ nguồn bên thứ ba</li>
            </ul>
            
            <h3 style="color: #333; margin-top: 24px; margin-bottom: 16px;">5. Thay đổi điều khoản</h3>
            <p>Diệp Trà có quyền cập nhật điều khoản sử dụng bất cứ lúc nào. Phiên bản mới sẽ có hiệu lực ngay khi được đăng tải.</p>
            
            <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 16px; margin-top: 24px;">
              <p style="margin: 0;"><strong>Liên hệ:</strong> Mọi thắc mắc về điều khoản sử dụng, vui lòng liên hệ <strong>info@dieptra.com</strong> hoặc hotline <strong>1900 xxxx</strong></p>
            </div>
          </div>
        `,
      },
    ];

    // Tạo từng trang con
    for (const pageData of childPages) {
      const childPage = await prisma.pages.create({
        data: {
          ...pageData,
          parent_id: mainPage.id,
          is_active: true,
          is_main_page: false,
        },
      });
      return childPage;
    }
  } catch (error) {
    console.error('❌ Error seeding pages:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
