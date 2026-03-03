# Changelog - Lunaby Bot

## [1.3.0-native] - 2026-03-03

### 🔥 Highlights
- **Hỗ trợ đa cơ sở dữ liệu (MongoDB + MariaDB)**: Tích hợp thêm MariaDB để quản lý Logging, Blacklist và Prefix, giúp giảm tải và phân tách rõ ràng với MongoDB (chuyên xử lý Core data như Profiles, Conversations).
- **Hệ thống lệnh Prefix (Prefix Commands)**: Hỗ trợ người dùng gọi lệnh bằng Prefix thay vì chỉ dùng Slash Commands .

### ✨ Added
- **Prefix Handler (`handlers/prefixHandler.js`)**: Lớp giả lập `PseudoInteraction` giúp chạy các Slash Command cũ dưới dạng Prefix Command mà không cần viết lại logic lệnh.
- **MariaDB Client (`services/database/mariaClient.js`)**: Pool kết nối đến MariaDB.
- **Service Database Mới**: Thêm `PrefixDB.js`, `MariaBlacklistDB.js`, `MariaModDB.js` để lưu trữ dữ liệu chuyên biệt vào MariaDB.
- **DatabaseManager (`services/database/DatabaseManager.js`)**: Quản lý tập trung các collection và index của MongoDB, thay thế các mã khởi tạo phân tán trước đây.

### ⚙️ Changed
- Cấu trúc lại thư mục `services`: Chuyển logic hệ thống DB vào thư mục `services/database/`.
- Cập nhật `example.env` để thêm các biến môi trường cấu hình kết nối MariaDB.
- Sửa một số command và update file cấu hình prompt.

---

## [1.2.0-native] - 2026-01-01

### 🔥 Highlights
- Chuyển đổi hoàn toàn từ `axios` sang `native fetch` - giảm dependencies
- Lunaby model tích hợp sẵn web search - loại bỏ WebSearchService
- Chuẩn hóa logging với hệ thống logger thay thế console.error

### ✨ Added
- `utils/embedUtils.js`: Shared utilities cho Discord embeds (colors, status maps, helpers)
- Status mapping helpers trong `MyAnimeListAPI.js`: `_getAnimeStatus()`, `_getMangaStatus()`, `_getSeasonName()`

### ⚙️ Changed
- `services/MyAnimeListAPI.js`: Refactored to use native fetch với AbortController timeout
- `services/WebSearchService.js`: Đã xóa (Lunaby model tích hợp sẵn search)
- `commands/AIcore/search.js`: Đã xóa (không cần thiết nữa)
- 10 command files: Thay thế `console.error` → `logger.error`
  - Social: setbio, setcolor, setbirthday, unequip, rank, leaderboard, inventory
  - Core: about, help
  - Moderation: modlog

### 🧹 Removed
- **`axios`** dependency từ package.json
- **`services/WebSearchService.js`** - Lunaby model đã tích hợp sẵn search
- **`commands/AIcore/search.js`** - Lệnh search riêng không còn cần thiết

### ⚠️ Migration Notes
- Chạy `npm install` để cập nhật dependencies sau khi xóa axios
- Web search giờ được xử lý tự động bởi Lunaby model

---

## [1.1.0-native] - 2025-11-18

### 🔥 Highlights
- Hỗ trợ streaming cho chat văn bản và hoàn thành mã (streaming dựa trên SSE, tương thích với Heroku)
- Bộ xử lý streaming thời gian thực cho Discord để cập nhật tin nhắn dần dần
- Cải thiện việc xác thực và gộp tin nhắn để đáp ứng yêu cầu của nhà cung cấp

### ✨ Added
 - `handlers/streamingHandler.js`: lớp giao diện streaming mới cho tin nhắn Discord (an toàn với giới hạn chỉnh sửa, hỗ trợ chia chunk)
 - Bộ phân tích SSE trong `services/AICore.js` để xử lý các frame `event:`/`data:` của nhà cung cấp và terminator `[DONE]`
 - Hỗ trợ `stream: true` cho các yêu cầu mô hình chạy lâu

### ⚙️ Changed
 - Chat & Code: streaming giờ là luồng mặc định, kèm fallback non-stream khi cần
 - Search & Image: sử dụng endpoint non-stream (tạo ảnh và web search vẫn là non-stream)
 - Prompts: `config/prompts.js` được chuyển sang tiếng Anh, tối ưu `thinking` và `memoryExtraction`
 - Logging: in tiêu đề console + `console.clear()` khi khởi động; logger có màu, sạch hơn

### 🛠️ Fixed
- Đã xử lý lỗi 408/timeout trên Lunaby bằng cách dùng streaming cho các yêu cầu lâu
- Sửa lỗi xử lý buffer SSE để tái tạo các delta JSON khi bị tách qua nhiều chunk TCP
- Loại bỏ các tin nhắn assistant rỗng và gộp các tin nhắn liên tiếp cùng vai trò để thỏa mãn xác thực của nhà cung cấp

### 🧹 Removed / Cleaned
- Đã loại bỏ prompt `analysis` cũ và hàm `analyzeContentWithAI()` (không dùng)

### ⚠️ Migration / Notes
- Các tin nhắn streaming được tránh giới hạn chỉnh sửa của Discord (khoảng 800ms giữa các cập nhật)
- Nếu bạn phụ thuộc vào hành vi sync khi `require` trước đây cho các module DB, hãy cập nhật import để gọi dịch vụ một cách rõ ràng sau `client.ready`

---

## [1.0.0] - 2025-11-03

### 🎨 Added - Profile Customization System
Tích hợp hệ thống profile customization với canvas 800x600 pixels và các tính năng tùy chỉnh đầy đủ.

#### New Commands
- **`/profile`** - Hiển thị profile card với rank, level, XP và thông tin cá nhân
  - Canvas mới 800x600 pixels (thay thế card cũ 934x282)
  - Hiển thị bio, birthday, balance, emblem, pattern, wreath, hat
  - Hỗ trợ customization màu sắc và background
  - Tự động xếp hạng server và global
  
- **`/setbio <text>`** - Đặt bio cho profile card (tối đa 200 ký tự)
  - Lưu vào `profile.data.profile.bio`
  - Hiển thị trên section "BIO" của canvas
  
- **`/setcolor <hex>`** - Đặt màu chủ đạo cho profile card
  - Hỗ trợ format #RRGGBB hoặc "default" để reset
  - Áp dụng cho TIP section và XP circles
  - Lưu vào `profile.data.profile.color`
  
- **`/setbirthday <DD-MM>`** - Đặt ngày sinh
  - Format DD-MM (ví dụ: 15-08)
  - Validation ngày (1-31) và tháng (1-12)
  - Lưu vào `profile.data.profile.birthday`
  
- **`/inventory`** - Xem items trong túi đồ
  - Hiển thị items được nhóm theo type (background, pattern, emblem, hat, wreath)
  - Rarity system với emoji: ⚪ Common, 🔵 Rare, 🟣 Epic, 🟠 Legendary, 🌟 Achievement
  - Lấy data từ `profile.data.profile.inventory`
  
- **`/use <id>`** - Trang bị item từ inventory
  - Equip background, pattern, emblem, hat, hoặc wreath
  - Tự động detect type và update đúng field
  - Lưu URL vào `profile.data.profile.{type}`
  
- **`/unequip <type>`** - Gỡ item đã trang bị
  - Choices: background, pattern, emblem, hat, wreath
  - Set field về null
  - Kiểm tra item có đang equipped không

#### New Services
- **`services/canvas/rankCanvas.js`** - Canvas engine mới
  - 800x600 pixels với layout phức tạp
  - Left card: Pattern overlay + Avatar với wreath/hat + XP circles (Level/Server/Global)
  - Right card: Background image + Bio section + Birthday + Balance + Emblem indicator
  - TIP section ở góc trên bên phải với màu tùy chỉnh
  - Wavy shape separator giữa 2 cards
  - Text wrapping cho bio (max 200 chars)
  - Gradient fallback nếu images fail to load

#### New Assets
- **`assets/json/market.json`** - Item marketplace definitions
  - 12 items mẫu across 5 types
  - Structure: `{id, name, description, type, url, price, rarity}`
  - 3 backgrounds (5k-10k credits)
  - 2 patterns (3k-4k credits)
  - 2 emblems (15k-20k credits)
  - 3 achievement wreaths (Top 1/5/10)
  - 2 hats (5k-12k credits)

### 🗑️ Removed - Deprecated Files
- **`services/canvas/profileCanvas.js`** - Old 522-line profile canvas (replaced by rankCanvas.js)
- **`utils/profileCommand.js`** - Old profile command utility (replaced by commands/social/profile.js)
- **`storagedb.generateProfileCard()`** - Method using old profileCanvas
- **`storagedb.getProfileCardData()`** - Helper method for old profile system

### 🔧 Modified - Core Updates

#### `services/profiledb.js`
- Schema đã có sẵn tất cả fields cần thiết:
  - `data.profile.bio` - User bio text
  - `data.profile.background` - Background image URL
  - `data.profile.pattern` - Pattern overlay URL
  - `data.profile.emblem` - Emblem badge URL
  - `data.profile.hat` - Hat accessory URL
  - `data.profile.wreath` - Wreath border URL (for top players)
  - `data.profile.color` - Hex color code for theme
  - `data.profile.birthday` - Birthday in DD-MM format
  - `data.profile.inventory[]` - Array of owned items

#### `services/MyAnimeListAPI.js`
- ✅ Updated import: `MessageEmbed` → `EmbedBuilder` (Discord.js v14)
- Methods return embed objects (not class instances)

#### `services/storagedb.js`
- ❌ Removed `generateProfileCard()` method
- ❌ Removed `getProfileCardData()` method
- ❌ Removed require('./canvas/profileCanvas')

#### `commands/social/rank.js`
- Uses `rankCanvas.js` for rank cards
- Compatible with Discord.js v14

### 📦 Dependencies
No changes to package.json:
- `discord.js`: ^14.19.2 ✅
- `canvas`: ^3.1.0 ✅
- `mongodb`: ^6.16.0 ✅

### ✨ Database Schema
MongoDB collections structure remains compatible:
```javascript
user_profiles {
  _id: userId,
  data: {
    profile: {
      bio: String,           // Max 200 chars
      background: String,    // Image URL or null
      pattern: String,       // Image URL or null
      emblem: String,        // Image URL or null
      hat: String,           // Image URL or null
      wreath: String,        // Image URL or null
      color: String,         // Hex code (#RRGGBB) or null
      birthday: String,      // DD-MM format or null
      inventory: [           // Array of items
        { id: Number, quantity: Number }
      ]
    },
    xp: [],                  // Server XP data
    global_xp: Number,
    global_level: Number,
    economy: { ... },
    reputation: { ... }
  }
}
```

---

## Previous Versions
Version history before profile system integration not documented.
