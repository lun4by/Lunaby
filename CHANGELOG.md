# Changelog - Lunaby Bot

## [3.0.1-native] - 2026-04-07

### Highlights
- **V3 update i18n**: Mở rộng hỗ trợ đa ngôn ngữ và hoàn thiện luồng i18n cho command responses, moderation, và command metadata.
- **Cấu hình runtime rõ ràng hơn**: Chuẩn hóa env cho support URL, website, invite permissions, và tách biệt rõ `development`/`production`.

### Added
- **I18n verification dev-only**:
  - Tích hợp verify translation keys vào `i18nManager`
  - Quét keys dùng trong `src/commands`
  - Hỗ trợ `I18N_VERIFY_ON_START` và `I18N_STRICT`
- **Biến môi trường mới / được chuẩn hóa**:
  - `SUPPORT_SERVER_URL`
  - `DISCORD_BOT_PERMISSIONS`
  - `WEBSITE_URL`
  - `NODE_ENV`
- **`cross-env`** trong `devDependencies` để set `NODE_ENV` portable trên Windows.

### Changed
- **V3 i18n flow**:
  - Hoàn thiện tích hợp i18n trong `i18nManager`
  - Cập nhật thêm locale/error handling cho moderation commands
  - Mở rộng multilingual support cho command responses và metadata
- **`commands/Core/about.js`**: Tiếp tục tinh gọn command, dùng text đa ngôn ngữ, và chuyển support/invite/website URL sang env.
- **`utils/discord/blacklistUtils.js`**: Nút support server dùng `SUPPORT_SERVER_URL` từ env thay vì hardcode.
- **Logging**:
  - Làm rõ và thống nhất log messages ở nhiều service
  - Dịch nhiều error/log message tiếng Việt sang tiếng Anh để dễ debug hơn
- **`example.env`**: Đồng bộ lại với các biến môi trường đang được code sử dụng trực tiếp.

### Migration Notes
- Chạy `npm install` để cài thêm `cross-env`.
- Cập nhật `.env` theo các biến mới trong `example.env`.
- Nếu muốn kiểm tra i18n khi phát triển:
  - bật `I18N_VERIFY_ON_START=true`
  - bật thêm `I18N_STRICT=true` nếu muốn thiếu key là fail startup

---

## [2.1.0-native] - 2026-03-28

### Highlights
- **Hệ thống Canvas mới (lunaby-canvas)**: Tách toàn bộ engine vẽ canvas ra package riêng `lunaby-canvas`, thay thế hoàn toàn các social command cũ bằng render hình ảnh chuyên nghiệp.
- **Level-up & Leaderboard hình ảnh**: Thông báo lên cấp bằng canvas đẹp mắt và bảng xếp hạng render dưới dạng image card.
- **Hệ thống Credits & AI Quota**: Giới thiệu hệ thống kinh tế nội bộ (credits) kèm quota sử dụng AI, cho phép người dùng mua thêm lượt dùng.
- **LVoice — Kênh thoại tạm thời**: Hệ thống tạo kênh voice tạm thời tự động khi người dùng tham gia.
- **Di chuyển dữ liệu sang MariaDB**: Chuyển profiles, economy, XP/levels, consent, guild settings sang MariaDB để tối ưu hiệu suất.
- **Sharding**: Hỗ trợ ShardingManager để mở rộng bot ra nhiều shard.

### Added
- **`lunaby-canvas` package**: Tách canvas engine ra package độc lập, hỗ trợ render rank card, profile card, level-up card, và leaderboard card.
- **Level-up System (`levelupsetting`, `levelcanvas`)**: Thông báo lên cấp với canvas tùy chỉnh, cài đặt kênh thông báo level-up cho từng server.
- **Leaderboard Image**: Lệnh `/leaderboard` giờ render bảng xếp hạng dưới dạng image card thay vì embed text.
- **`commands/social/avatar.js`**: Lệnh xem avatar người dùng với thông tin nickname, ID, màu accent.
- **`commands/social/banner.js`**: Lệnh xem banner profile của người dùng.
- **`commands.json`**: File metadata quản lý thông tin lệnh tập trung.
- **Credits System (`credits`, `givecredits`)**: Hệ thống kinh tế credits với các lệnh xem, chuyển và quản trị.
- **AI Quota System (`buyquota`)**: Hệ thống giới hạn lượt sử dụng AI (chat, code, image) với lệnh mua thêm quota bằng credits.
- **`donate` command**: Lệnh hiển thị thông tin ủng hộ dự án.
- **LVoice (`lvoice`)**: Hệ thống kênh voice tạm thời — tự tạo khi join, tự xóa khi rời.
- **ShardingManager (`shard.js`)**: Hỗ trợ chạy bot trên nhiều shard với presence đồng bộ.
- **Emoji Config (`config/emojis.js`)**: Hệ thống emoji tập trung, thống nhất icon feedback trên toàn bộ lệnh.
- **`getOneTimeCompletion()`**: Hàm gọi AI một lần (one-shot) phục vụ các lệnh moderation.
- **`home` option trong Help menu**: Thêm nút quay về trang chủ trong menu `/help`.

### Changed
- **Database Migration**: Chuyển user profiles, economy, XP/levels, consent, và guild settings từ MongoDB sang MariaDB (`MariaModDB`, `user_levels` table).
- **Rank/Profile cards**: Cập nhật luồng dữ liệu rank/profile card để dùng `lunaby-canvas` API, truyền numeric rank và populate dữ liệu chính xác.
- **Moderation commands**: Cải thiện toàn diện giao diện và UX các lệnh moderation (embeds, messages, imports).
- **Prefix Handler**: Sửa lỗi prefix và hỗ trợ dynamic prefix trong usage/help messages.
- **Image Handler**: Tin nhắn "đang tạo ảnh" giờ được chỉnh sửa để đính kèm ảnh trực tiếp thay vì gửi tin nhắn mới.
- **VoiceWelcome**: Thêm alias và footer chào mừng cho voice welcome.
- **About embed**: Cập nhật giao diện embed lệnh `/about`.
- **Command Usage Logging**: Nâng cấp hệ thống ghi log sử dụng lệnh.
- **Prompts**: Cập nhật và tinh chỉnh prompt AI.
- **`lunaby-sdk`**: Bump lên phiên bản `2.1.1`.
- **GIF Source**: Refactor nguồn GIF và hỗ trợ parse mention.
- **Consent Service**: Chuyển lưu trữ consent sang MariaDB.

### Fixed
- Sửa lỗi `reset_history` không hoạt động đúng.
- Sửa lỗi chat handler thiếu `try/catch` gây crash.
- Sửa lỗi social commands gửi attachment thiếu `content` rỗng.
- Sửa lỗi XP metrics và rank không hiển thị đúng.
- Sửa lỗi đường dẫn (path) trong error handler.
- Sửa lỗi prefix command không hoạt động với subcommand.
- Sửa lỗi setting handler thiếu error handling.
- Sửa lỗi help banner link.

### Removed
- Loại bỏ các social commands cũ (thay thế bằng `lunaby-canvas`).
- Xóa `GuildProfileDB` cũ (thay bằng `MariaModDB`).
- Xóa `system/dashboard`.
- Xóa `Lunaby_Help.jpg` (không còn dùng).

### Migration Notes
- Chạy `npm install` để cài `lunaby-canvas` và cập nhật `lunaby-sdk`.
- Cấu hình MariaDB cho các bảng mới: `user_levels`, profiles, economy, consent.
- Thêm `ENCRYPTION_KEY` vào `.env` (bắt buộc validate khi khởi động).
- Cấu hình `shard.js` nếu muốn chạy multi-shard.

---

## [2.0.0-native] - 2026-03-24

### Highlights
- **Kiến trúc hệ thống mới**: Tái cấu trúc toàn diện dự án, đưa toàn bộ mã nguồn vào thư mục `src/` để quản lý sạch sẽ và chuyên nghiệp hơn.
- **Phân tách Services**: Tổ chức lại 16 file dịch vụ (services) gốc tản mác thành các module logic riêng biệt (`ai/`, `user/`, `system/`, `api/`, `web/`, `database/`).
- **Dual-mode Streaming**: Nâng cấp cốt lõi hệ thống stream tin nhắn AI với 2 chế độ: stream tức thì cực mượt (Immediate) và stream qua bộ đệm (Buffered Mode) để triệt tiêu hoàn toàn lỗi Rate Limit (429) của Discord.

### Added
- **`commands/Core/about.js`**: Lệnh giới thiệu tiểu sử (lore) lấy cảm hứng từ *Cơ Lãnh Âm* cùng hệ thống hiển thị trạng thái bot.
- **`commands/Core/ping.js`**: Lệnh đo độ trễ với giao diện tương tác mới, cho phép người dùng click làm mới (refresh) trạng thái liên tục.
- Cấu hình `DISCORD_STREAM_DELAY_MS` dùng để tinh chỉnh tốc độ tin nhắn của bot.

### Changed
- **`StreamingService.js`**: Viết lại hoàn toàn logic gửi tin nhắn để hỗ trợ Mutex Queue và `setInterval`.
- Cập nhật luồng xử lý chat và code (`chatRequestHandler.js`, `codeRequestHandler.js`) để kết nối với engine stream mới.

### Removed
- Loại bỏ vĩnh viễn hệ thống cấu hình stream cũ (`STREAM_UPDATE_INTERVAL_MS`, `STREAM_MIN_CHUNK_SIZE`, `STREAM_BATCH_UPDATE_SIZE`).

---

## [1.3.2-native] - 2026-03-04

### Highlights
- **Cập nhật giao diện Embeds**: Sử dụng `embedUtils.js` để tạo embeds nhất quán và chuyên nghiệp hơn cho toàn bộ bot.
- **Tối ưu hóa toàn diện**: Cải thiện hiệu suất và cấu trúc mã nguồn.
- **Cải thiện trải nghiệm người dùng**: Tối ưu hóa hiển thị thông tin, thêm icon và định dạng rõ ràng.

### Added
- **Lệnh Quản trị**: Thêm lệnh `enable` và `disable` bật tắt lệnh ở các kênh.

### Changed
- **`commands/Core/lunaby.js`**: Cập nhật sử dụng `createLunabyEmbed()` thay vì `EmbedBuilder` trực tiếp.
- **`commands/Core/ping.js`**: Cập nhật sử dụng `createLunabyEmbed()`, `createStatusEmbed()`, `createDetailedEmbed()` từ `embedUtils.js`.
- **`utils/discord/embedUtils.js`**: Tối ưu hóa các hàm tạo embed, loại bỏ icon không cần thiết trong tiêu đề, cải thiện định dạng.

### Migration Notes
- Không cần thay đổi gì.

---

## [1.3.0-native] - 2026-03-03

### Highlights
- **Hỗ trợ đa cơ sở dữ liệu (MongoDB + MariaDB)**: Tích hợp thêm MariaDB để quản lý Logging, Blacklist và Prefix, giúp giảm tải và phân tách rõ ràng với MongoDB (chuyên xử lý Core data như Profiles, Conversations).
- **Hệ thống lệnh Prefix (Prefix Commands)**: Hỗ trợ người dùng gọi lệnh bằng Prefix thay vì chỉ dùng Slash Commands.

### Added
- **`commands/Core/personalize.js`**: Lệnh `/personalize` mới thay thế `/memory` cũ. Cung cấp giao diện tương tác (StringSelectMenu) cho phép:
  - Cập nhật nghề nghiệp và hướng dẫn tùy chỉnh thông qua form trực tiếp.
  - Quản lý trí nhớ AI và bật/tắt (Toggle) việc AI sử dụng lịch sử trò chuyện.
- **Prefix Handler (`handlers/prefixHandler.js`)**: Lớp giả lập `PseudoInteraction` giúp chạy Prefix Command mà không cần viết lại logic lệnh.
- **MariaDB Client (`services/database/mariaClient.js`)**: Pool kết nối đến MariaDB.
- **Service Database Mới**: Thêm `PrefixDB.js`, `MariaBlacklistDB.js`, `MariaModDB.js` để lưu trữ dữ liệu chuyên biệt vào MariaDB.
- **DatabaseManager (`services/database/DatabaseManager.js`)**: Quản lý tập trung các collection và index của MongoDB, thay thế các mã khởi tạo phân tán trước đây.

### Changed
- **`services/MemoryService.js`**: Mở rộng schema, bổ sung `customInstructions` và `allowSearchHistoryReference`.
- **`services/ConversationService.js`**: Logic trò chuyện giờ đọc các cài đặt quyền riêng tư mới và tiêm thông tin tùy chỉnh vào ngữ cảnh AI.
- Cấu trúc lại thư mục `services`: Chuyển logic hệ thống DB vào thư mục `services/database/`.
- Cập nhật `example.env` để thêm các biến môi trường cấu hình kết nối MariaDB.
- Sửa một số command và update file cấu hình prompt.
- Tối ưu hóa DatabaseManager để quản lý tập trung các collection và index của MongoDB.

### Removed
- **`commands/AIcore/memory.js`**: Đã xóa (thay bằng `personalize`).
- Loại bỏ các câu lệnh không cần thiết.

### Migration Notes
- Chạy `npm install` để cập nhật dependencies.

---

## [1.2.0-native] - 2026-01-01

### Highlights
- Chuyển đổi hoàn toàn từ `axios` sang `native fetch` - giảm dependencies
- Lunaby model tích hợp sẵn web search - loại bỏ WebSearchService
- Chuẩn hóa logging với hệ thống logger thay thế console.error

### Added
- `utils/discord/embedUtils.js`: Shared utilities cho Discord embeds (colors, status maps, helpers)
- Status mapping helpers trong `MyAnimeListAPI.js`: `_getAnimeStatus()`, `_getMangaStatus()`, `_getSeasonName()`

### Changed
- `services/MyAnimeListAPI.js`: Refactored to use native fetch với AbortController timeout
- `services/WebSearchService.js`: Đã xóa (Lunaby model tích hợp sẵn search)
- `commands/AIcore/search.js`: Đã xóa (không cần thiết nữa)
- 10 command files: Thay thế `console.error` → `logger.error`
  - Social: setbio, setcolor, setbirthday, unequip, rank, leaderboard, inventory
  - Core: about, help
  - Moderation: modlog

### Removed
- **`axios`** dependency từ package.json
- **`services/WebSearchService.js`** - Lunaby model đã tích hợp sẵn search
- **`commands/AIcore/search.js`** - Lệnh search riêng không còn cần thiết

### Migration Notes
- Chạy `npm install` để cập nhật dependencies sau khi xóa axios
- Web search giờ được xử lý tự động bởi Lunaby model

---

## [1.1.0-native] - 2025-11-18

### Highlights
- Hỗ trợ streaming cho chat văn bản và hoàn thành mã (streaming dựa trên SSE, tương thích với Heroku)
- Bộ xử lý streaming thời gian thực cho Discord để cập nhật tin nhắn dần dần
- Cải thiện việc xác thực và gộp tin nhắn để đáp ứng yêu cầu của nhà cung cấp

### Added
 - `handlers/streamingHandler.js`: lớp giao diện streaming mới cho tin nhắn Discord (an toàn với giới hạn chỉnh sửa, hỗ trợ chia chunk)
 - Bộ phân tích SSE trong `services/AICore.js` để xử lý các frame `event:`/`data:` của nhà cung cấp và terminator `[DONE]`
 - Hỗ trợ `stream: true` cho các yêu cầu mô hình chạy lâu

### Changed
 - Chat & Code: streaming giờ là luồng mặc định, kèm fallback non-stream khi cần
 - Search & Image: sử dụng endpoint non-stream (tạo ảnh và web search vẫn là non-stream)
 - Prompts: `config/prompts.js` được chuyển sang tiếng Anh, tối ưu `thinking` và `memoryExtraction`
 - Logging: in tiêu đề console + `console.clear()` khi khởi động; logger có màu, sạch hơn

### Fixed
- Đã xử lý lỗi 408/timeout trên Lunaby bằng cách dùng streaming cho các yêu cầu lâu
- Sửa lỗi xử lý buffer SSE để tái tạo các delta JSON khi bị tách qua nhiều chunk TCP
- Loại bỏ các tin nhắn assistant rỗng và gộp các tin nhắn liên tiếp cùng vai trò để thỏa mãn xác thực của nhà cung cấp

### Removed / Cleaned
- Đã loại bỏ prompt `analysis` cũ và hàm `analyzeContentWithAI()` (không dùng)

### Migration / Notes
- Các tin nhắn streaming được tránh giới hạn chỉnh sửa của Discord (khoảng 800ms giữa các cập nhật)
- Nếu bạn phụ thuộc vào hành vi sync khi `require` trước đây cho các module DB, hãy cập nhật import để gọi dịch vụ một cách rõ ràng sau `client.ready`

---

## [1.0.0] - 2025-11-03

### Added - Profile Customization System
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
- Updated import: `MessageEmbed` → `EmbedBuilder` (Discord.js v14)
- Methods return embed objects (not class instances)

#### `services/storagedb.js`
- Removed `generateProfileCard()` method
- Removed `getProfileCardData()` method
- Removed require('./canvas/profileCanvas')

#### `commands/social/rank.js`
- Uses `rankCanvas.js` for rank cards
- Compatible with Discord.js v14

### Dependencies
No changes to package.json:
- `discord.js`: ^14.19.2 
- `canvas`: ^3.1.0 
- `mongodb`: ^6.16.0 

### Database Schema
MongoDB collections structure remains compatible:
```javascript
user_profiles {
  _id: userId,
  data: {
    profile: {
      bio: String,
      background: String, 
      pattern: String,       
      emblem: String,        
      hat: String,           
      wreath: String,        
      color: String,         
      birthday: String,      
      inventory: [           
        { id: Number, quantity: Number }
      ]
    },
    xp: [],                  
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