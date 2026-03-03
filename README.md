# Lunaby - Bot Trợ Lý AI Cho Discord

<div align="center">
  <img src="./assets/lunaby-avatar.png" alt="Ảnh đại diện bot Lunaby" width="200" height="200" style="border-radius: 50%;">
  <br>
  <em>Trợ lý AI thông minh cho Discord của bạn</em>
</div>

## Tổng Quan

Lunaby là bot Discord được hỗ trợ bởi **local offline models**. Bot có tính cách thân thiện và hỗ trợ nhiều tác vụ như trò chuyện, tạo mã nguồn và tạo hình ảnh. Tích hợp hệ thống cấp độ và thành tựu để khuyến khích tương tác người dùng.
> Lunaby Bot sử dụng **local offline models** với model LLM được build(fine-tune) dựa trên GPT OSS 120B.

## Tính Năng Chính

- **Trò chuyện thông minh**: Tương tác tự nhiên với khả năng ghi nhớ ngữ cảnh  
- **Tạo hình ảnh**: Tạo hình ảnh từ mô tả văn bản đơn giản  
- **Trợ lý lập trình**: Hỗ trợ lập trình và tạo mã nguồn  
- **Hệ thống bộ nhớ**: Ghi nhớ ngữ cảnh cuộc trò chuyện cho tương tác tự nhiên  
- **Quản lý máy chủ**: Tự động triển khai lệnh cho máy chủ mới  
- **Hệ thống tiến độ**: Hệ thống cấp độ với thành tựu và phần thưởng  
- **Thẻ hồ sơ**: Hiển thị thông tin người dùng hiện đại  
- **Đồng bộ dữ liệu**: Lưu trữ dữ liệu người dùng và máy chủ với MongoDB  
- **Kiến trúc đa nhà cung cấp**: Tự động chuyển đổi API để đảm bảo hoạt động liên tục
- **Hỗ trợ Prefix Command**: Sử dụng các lệnh qua tiền tố (prefix) linh hoạt kết hợp với Slash command truyền thống
- **Hệ thống đa cơ sở dữ liệu**: Tích hợp MongoDB và MariaDB để tối ưu hóa việc phân tách và lưu trữ dữ liệu chuyên biệt

## Kiến Trúc Hệ Thống

Lunaby đã được tái cấu trúc hoàn toàn với hệ thống AI cục bộ tối ưu:

### **AICore.js** - Trung tâm xử lý AI
- Xử lý tất cả yêu cầu AI và logic xử lý
- Tương tác với các local offline models
- Cấu hình model bảo mật
- Quản lý resource và tối ưu hiệu suất

### **ConversationService.js** - Quản lý cuộc trò chuyện
- Quản lý ngữ cảnh và bộ nhớ
- Xử lý tương tác người dùng
- Khả năng ghi nhớ cao

### **ImageService.js** - Xử lý hình ảnh
- Tích hợp local image generation
- Theo dõi tiến trình tạo hình ảnh
- Chức năng hình ảnh độc lập

### **SystemService.js** - Tiện ích hệ thống
- Xác thực môi trường và kiểm tra hệ thống
- Khởi tạo logging và quản lý
- Bảo trì định kỳ tự động

## Cài Đặt

1. Clone repository này
2. Cài đặt dependencies: `npm install`
3. Tạo file `.env` từ `example.env`
4. Cấu hình API keys cho các nhà cung cấp mong muốn
5. Chạy bot: `npm start` 

## Các Lệnh Có Sẵn

| Lệnh | Mô Tả |
|---------|-------------|
| `/help` | Hiển thị các lệnh có sẵn |
| `/ping` | Kiểm tra thời gian phản hồi bot |
| `/about` | Thông tin về Lunaby |
| `/think` | Hiển thị quá trình suy nghĩ của AI |
| `/image` | Tạo hình ảnh từ văn bản |
| `/reset` | Đặt lại cuộc trò chuyện với bot |
| `/profile` | Xem thẻ hồ sơ người dùng |

## Lợi Ích Kiến Trúc

### **Độ tin cậy cao**
- Chạy cục bộ mà không phụ thuộc vào API bên ngoài
- Không bị giới hạn quota từ các nhà cung cấp
- Kiểm soát hoàn toàn dữ liệu người dùng
- Hiệu suất ổn định

### **Dễ bảo trì**
- Kiến trúc dịch vụ modular
- Sửa lỗi và cập nhật được tách biệt
- Tổ chức code được cải thiện

### **Khả năng mở rộng**
- Các dịch vụ có thể mở rộng dễ dàng
- Dễ dàng thêm tính năng mới
- Hệ thống logger thay thế console.log
- Dễ dàng tích hợp các local models khác

## Đóng Góp

Tôi chào đón mọi đóng góp, báo cáo lỗi và yêu cầu tính năng! Bot được thiết kế với kiến trúc modular mới giúp việc mở rộng và tùy chỉnh trở nên cực kỳ dễ dàng.

### Hướng Dẫn Phát Triển
- Sử dụng dịch vụ phù hợp cho từng loại chức năng
- Tất cả logic AI: `AICore.js`
- Xử lý logic cuộc trò chuyện: `ConversationService.js`
- Xử lý hình ảnh: `ImageService.js`
- Tiện ích hệ thống: `SystemService.js`

## Giấy Phép

[MIT](LICENSE) | [Điều Khoản Dịch Vụ](./docs/legal/terms-of-service.md) | [Chính Sách Bảo Mật](./docs/legal/privacy-policy.md)
