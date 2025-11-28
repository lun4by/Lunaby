const mongoClient = require('../mongoClient');
const logger = require('../../utils/logger');
const { COLLECTIONS, SEVERITY_LEVELS } = require('../../config/constants');

class ImageBlacklistDB {
  async checkImageBlacklist(text) {
    try {
      const db = mongoClient.getDb();
      const blacklist = await db.collection(COLLECTIONS.IMAGE_BLACKLIST)
        .find({}, { projection: { keyword: 1, category: 1, _id: 0 } })
        .toArray();
      
      const lowerText = text.toLowerCase();
      const matchedKeywords = [];
      const categories = new Set();

      for (const item of blacklist) {
        if (lowerText.includes(item.keyword.toLowerCase())) {
          matchedKeywords.push(item.keyword);
          categories.add(item.category);
        }
      }

      return {
        isBlocked: matchedKeywords.length > 0,
        matchedKeywords,
        categories: Array.from(categories)
      };
    } catch (error) {
      logger.error('DATABASE', 'Error checking blacklist:', error);
      return {
        isBlocked: false,
        matchedKeywords: [],
        categories: []
      };
    }
  }

  async addToImageBlacklist(keyword, category, description, severity = SEVERITY_LEVELS.MEDIUM) {
    try {
      const db = mongoClient.getDb();

      const existing = await db.collection(COLLECTIONS.IMAGE_BLACKLIST).findOne({ keyword });
      if (existing) {
        return false;
      }

      await db.collection(COLLECTIONS.IMAGE_BLACKLIST).insertOne({
        keyword,
        category,
        description,
        severity,
        createdAt: new Date()
      });

      return true;
    } catch (error) {
      logger.error('DATABASE', 'Error adding keyword to blacklist:', error);
      return false;
    }
  }

  async removeFromImageBlacklist(keyword) {
    try {
      const db = mongoClient.getDb();
      const result = await db.collection(COLLECTIONS.IMAGE_BLACKLIST).deleteOne({ keyword });
      return result.deletedCount > 0;
    } catch (error) {
      logger.error('DATABASE', 'Error removing keyword from blacklist:', error);
      return false;
    }
  }

  async getImageBlacklist() {
    try {
      const db = mongoClient.getDb();
      return await db.collection(COLLECTIONS.IMAGE_BLACKLIST)
        .find({}, { projection: { _id: 0, keyword: 1, category: 1 } })
        .toArray();
    } catch (error) {
      logger.error('DATABASE', 'Error getting blacklist:', error);
      return [];
    }
  }

  async initializeDefaultBlacklist() {
    try {
      const db = mongoClient.getDb();

      const count = await db.collection(COLLECTIONS.IMAGE_BLACKLIST).countDocuments();
      if (count > 0) {
        return true;
      }

      const defaultBlacklist = [
        { keyword: "khỏa thân", category: "adult", description: "Hình ảnh khỏa thân", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "nude", category: "adult", description: "Nude content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "erotic", category: "adult", description: "Erotic content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "sexy", category: "adult", description: "Nội dung gợi cảm", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "18+", category: "adult", description: "Nội dung 18+", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "nsfw", category: "adult", description: "Not safe for work content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "pornographic", category: "adult", description: "Pornographic content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "khiêu dâm", category: "adult", description: "Nội dung khiêu dâm", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "blood", category: "violence", description: "Blood content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "gore", category: "violence", description: "Gore content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "máu me", category: "violence", description: "Cảnh máu me", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "bạo lực", category: "violence", description: "Nội dung bạo lực", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "giết", category: "violence", description: "Hành động giết chóc", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "đánh đập", category: "violence", description: "Hành vi bạo lực", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "tử vong", category: "violence", description: "Cảnh tử vong", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "tai nạn", category: "violence", description: "Cảnh tai nạn", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "chính trị", category: "politics", description: "Nội dung chính trị nhạy cảm", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "đảng phái", category: "politics", description: "Nội dung về đảng phái", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "biểu tình", category: "politics", description: "Cảnh biểu tình", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "bạo động", category: "politics", description: "Cảnh bạo động chính trị", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "cách mạng", category: "politics", description: "Nội dung về cách mạng", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "chống đối", category: "politics", description: "Nội dung chống đối", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "phân biệt", category: "discrimination", description: "Phân biệt đối xử", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "racist", category: "discrimination", description: "Racist content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "kỳ thị", category: "discrimination", description: "Kỳ thị chủng tộc", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "phân biệt chủng tộc", category: "discrimination", description: "Phân biệt chủng tộc", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "phân biệt màu da", category: "discrimination", description: "Phân biệt màu da", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "tôn giáo", category: "religion", description: "Nội dung tôn giáo nhạy cảm", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "blasphemy", category: "religion", description: "Blasphemous content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "xúc phạm tôn giáo", category: "religion", description: "Xúc phạm tôn giáo", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "phỉ báng", category: "religion", description: "Phỉ báng tôn giáo", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "báng bổ", category: "religion", description: "Báng bổ tôn giáo", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "ma túy", category: "drugs", description: "Nội dung về ma túy", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "drugs", category: "drugs", description: "Drug content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "cocaine", category: "drugs", description: "Cocaine reference", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "heroin", category: "drugs", description: "Heroin reference", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "cần sa", category: "drugs", description: "Nội dung về cần sa", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "chất gây nghiện", category: "drugs", description: "Chất gây nghiện", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "vũ khí", category: "weapons", description: "Nội dung về vũ khí", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "súng", category: "weapons", description: "Hình ảnh súng đạn", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "đạn", category: "weapons", description: "Đạn dược", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "bom", category: "weapons", description: "Chất nổ", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "mìn", category: "weapons", description: "Mìn nổ", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "weapons", category: "weapons", description: "Weapon content", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "lừa đảo", category: "scam", description: "Nội dung lừa đảo", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "scam", category: "scam", description: "Scam content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "hack", category: "scam", description: "Hack content", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "cheat", category: "scam", description: "Cheat content", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "gian lận", category: "scam", description: "Nội dung gian lận", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "quấy rối", category: "harassment", description: "Nội dung quấy rối", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "harassment", category: "harassment", description: "Harassment content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "bắt nạt", category: "harassment", description: "Nội dung bắt nạt", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "bullying", category: "harassment", description: "Bullying content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "stalking", category: "harassment", description: "Stalking content", severity: SEVERITY_LEVELS.HIGH },
        { keyword: "xúc phạm", category: "offensive", description: "Nội dung xúc phạm", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "offensive", category: "offensive", description: "Offensive content", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "chửi bới", category: "offensive", description: "Ngôn từ chửi bới", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "thô tục", category: "offensive", description: "Ngôn từ thô tục", severity: SEVERITY_LEVELS.MEDIUM },
        { keyword: "nhạy cảm", category: "offensive", description: "Nội dung nhạy cảm", severity: SEVERITY_LEVELS.MEDIUM }
      ];

      await db.collection(COLLECTIONS.IMAGE_BLACKLIST).insertMany(defaultBlacklist);
      logger.info('DATABASE', `Added ${defaultBlacklist.length} keywords to blacklist`);

      return true;
    } catch (error) {
      logger.error('DATABASE', 'Error initializing image blacklist:', error);
      return false;
    }
  }
}

module.exports = new ImageBlacklistDB();
