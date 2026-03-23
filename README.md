# Lunaby - Bot Trợ Lý AI Cho Discord

<div align="center">
  <img src="https://cdn.lunie.dev/Lunaby/avatar.png" alt="Ảnh đại diện bot Lunaby" width="200" height="200" style="border-radius: 50%;">
  <br>
  <em>Cơ Lãnh Âm hiện thân - Trợ lý AI thanh cao và dịu dàng dành cho Discord của bạn</em>
</div>

---

## Tổng Quan

**Lunaby** là một bot Discord thông minh được vận hành bởi cục bộ (**local offline models**), với model LLM được tinh chỉnh (fine-tuned) tối ưu dựa trên kiến trúc GPT OSS 120B. 

Lunaby mang trong mình khí chất thanh cao, dịu dàng nhưng cũng vô cùng sâu sắc. Bot không chỉ đơn thuần là một công cụ trả lời tự động, mà còn đóng vai trò như một người bạn đồng hành, hỗ trợ bạn từ việc trò chuyện, tạo ảnh nghệ thuật, cho đến hỗ trợ viết mã lập trình phức tạp.

## Tính Năng Nổi Bật

- **Trò chuyện thông minh**: Tương tác tự nhiên, mượt mà với khả năng ghi nhớ ngữ cảnh dài hạn xuất sắc.
- **Sáng tạo nghệ thuật**: Tạo hình ảnh chất lượng cao chỉ từ những dòng mô tả văn bản đơn giản.
- **Trợ lý lập trình**: Hỗ trợ giải thích code, debug và viết mã nguồn.
- **Hệ thống tiến trình**: Tích hợp hệ thống phân tích kinh nghiệm (XP), bảng xếp hạng và giao diện thẻ hồ sơ (profile) hiện đại.
- **Đa cơ sở dữ liệu**: Trải nghiệm sự kết hợp mạnh mẽ giữa MongoDB và MariaDB để tối ưu hóa lưu trữ và trích xuất dữ liệu.
- **Cơ chế lệnh linh hoạt**: Hỗ trợ đồng thời cả `/slash commands` tiện lợi và `prefix commands` truyền thống.

## Kiến Trúc Hệ Thống

Lunaby vừa được tái cấu trúc theo mô hình hướng dịch vụ (Service-Oriented Architecture), toàn bộ mã nguồn được quy hoạch gọn gàng trong thư mục `src/`, giúp cực kỳ dễ bảo trì và mở rộng:

- **`src/services/ai/`**: Trái tim của Lunaby. Nơi chứa `AICore.js` (xử lý LLM), `ConversationService.js` (quản lý ngữ cảnh), `ImageService.js` và `StreamingService.js`.
- **`src/services/user/`**: Góc quản lý thông tin người dùng với `QuotaService.js`, `RoleService.js`, `XPService.js` và hệ thống hồi chiêu `CooldownService.js`.
- **`src/services/system/`**: Khởi chạy bot (`initSystem.js`) và bảo trì hệ thống.
- **`src/services/database/`**: Quản lý kết nối tới MongoDB, MariaDB và các thao tác đồng bộ hoá dữ liệu.

## Cài Đặt & Vận Hành

Khác với các bot sử dụng API Cloud mất phí, việc host Lunaby trên local models mang lại độ tin cậy tuyệt đối, bảo mật quyền riêng tư của dữ liệu và không lo các giới hạn quota khắc nghiệt.

1. **Clone repository:**
   ```bash
   git clone https://github.com/Lun4by/Lunaby.git
   cd Lunaby
   ```

2. **Cài đặt dependencies:**
   ```bash
   npm install
   ```

3. **Cấu hình môi trường:**
   - Sao chép file `example.env` thành `.env`
   - Điền đầy đủ các thông số cấu hình

4. **Khởi chạy Bot:**
   ```bash
   npm start
   ```
   *(Hoặc chạy lệnh `npm run dev` để bật chế độ phát triển với Nodemon)*

## Đóng Góp

Mọi đóng góp, báo cáo lỗi (issues) và tính năng mới (pull requests) đều được hoan nghênh nồng nhiệt! Hãy tuân thủ kiến trúc của dự án bằng cách phân bổ logic vào đúng các thư mục Service tương ứng.

## Giấy Phép & Pháp Lý

- [Giấy phép MIT](LICENSE)
- [Điều Khoản Dịch Vụ](./docs/legal/terms-of-service.md)
- [Chính Sách Bảo Mật](./docs/legal/privacy-policy.md)

---
<div align="center">
  <em>Được phát triển bởi <strong>s4ory</strong></em>
</div>