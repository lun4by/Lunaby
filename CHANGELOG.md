# Changelog - Lunaby Bot

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

### 🎯 Discord.js v14 Compliance
All commands verified compatible:
- ✅ SlashCommandBuilder syntax
- ✅ EmbedBuilder (no MessageEmbed)
- ✅ interaction.options.getString/getInteger/getUser
- ✅ interaction.deferReply / editReply
- ✅ AttachmentBuilder for canvas images
- ✅ No deprecated methods

### 🧹 Code Quality
- ❌ Removed all unnecessary comments (//) from 8 files
- ✅ Clean code without documentation clutter
- ✅ No syntax errors across all modified files
- ✅ Consistent code style maintained

### 📝 TODO - Future Enhancements
- [ ] Test complete profile system with real Discord bot
- [ ] Add economy system (register, shop, buy commands)
- [ ] Implement automatic wreath assignment for top players
- [ ] Replace placeholder image URLs in market.json with real assets
- [ ] Add more items to market (seasonal themes, special effects)
- [ ] Create admin commands for inventory management

### 🐛 Known Issues
None reported yet. System ready for testing.

---

## Previous Versions
Version history before profile system integration not documented.
