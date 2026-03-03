const mariaClient = require('./mariaClient');
const logger = require('../../utils/logger');
const { SEVERITY_LEVELS } = require('../../config/constants');

class MariaBlacklistDB {
    async initTables() {
        try {
            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS image_blacklist (
          id INT AUTO_INCREMENT PRIMARY KEY,
          keyword VARCHAR(255) NOT NULL UNIQUE,
          category VARCHAR(50) NOT NULL,
          description TEXT,
          severity ENUM('low','medium','high') DEFAULT 'medium',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_category (category),
          INDEX idx_keyword (keyword)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
            logger.info('MARIADB', 'image_blacklist table ready');
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error creating image_blacklist table:', error);
            return false;
        }
    }

    async checkImageBlacklist(text) {
        try {
            const rows = await mariaClient.query(
                'SELECT keyword, category FROM image_blacklist'
            );

            const lowerText = text.toLowerCase();
            const matchedKeywords = [];
            const categories = new Set();

            for (const item of rows) {
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
            logger.error('MARIADB', 'Error checking blacklist:', error);
            return { isBlocked: false, matchedKeywords: [], categories: [] };
        }
    }

    async addToImageBlacklist(keyword, category, description, severity = SEVERITY_LEVELS.MEDIUM) {
        try {
            await mariaClient.query(
                'INSERT IGNORE INTO image_blacklist (keyword, category, description, severity) VALUES (?, ?, ?, ?)',
                [keyword, category, description, severity]
            );
            return true;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') return false;
            logger.error('MARIADB', 'Error adding to blacklist:', error);
            return false;
        }
    }

    async removeFromImageBlacklist(keyword) {
        try {
            const result = await mariaClient.query(
                'DELETE FROM image_blacklist WHERE keyword = ?',
                [keyword]
            );
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('MARIADB', 'Error removing from blacklist:', error);
            return false;
        }
    }

    async getImageBlacklist() {
        try {
            return await mariaClient.query(
                'SELECT keyword, category FROM image_blacklist ORDER BY category, keyword'
            );
        } catch (error) {
            logger.error('MARIADB', 'Error getting blacklist:', error);
            return [];
        }
    }

    async initializeDefaultBlacklist() {
        try {
            const [row] = await mariaClient.query('SELECT COUNT(*) AS cnt FROM image_blacklist');
            if (row.cnt > 0) return true;

            const defaults = [
                ["khỏa thân", "adult", "Hình ảnh khỏa thân", "high"],
                ["nude", "adult", "Nude content", "high"],
                ["erotic", "adult", "Erotic content", "high"],
                ["sexy", "adult", "Nội dung gợi cảm", "medium"],
                ["18+", "adult", "Nội dung 18+", "high"],
                ["nsfw", "adult", "Not safe for work content", "high"],
                ["pornographic", "adult", "Pornographic content", "high"],
                ["khiêu dâm", "adult", "Nội dung khiêu dâm", "high"],
                ["blood", "violence", "Blood content", "high"],
                ["gore", "violence", "Gore content", "high"],
                ["máu me", "violence", "Cảnh máu me", "high"],
                ["bạo lực", "violence", "Nội dung bạo lực", "high"],
                ["giết", "violence", "Hành động giết chóc", "high"],
                ["đánh đập", "violence", "Hành vi bạo lực", "high"],
                ["tử vong", "violence", "Cảnh tử vong", "high"],
                ["tai nạn", "violence", "Cảnh tai nạn", "medium"],
                ["chính trị", "politics", "Nội dung chính trị nhạy cảm", "medium"],
                ["đảng phái", "politics", "Nội dung về đảng phái", "medium"],
                ["biểu tình", "politics", "Cảnh biểu tình", "medium"],
                ["bạo động", "politics", "Cảnh bạo động chính trị", "high"],
                ["cách mạng", "politics", "Nội dung về cách mạng", "medium"],
                ["chống đối", "politics", "Nội dung chống đối", "high"],
                ["phân biệt", "discrimination", "Phân biệt đối xử", "high"],
                ["racist", "discrimination", "Racist content", "high"],
                ["kỳ thị", "discrimination", "Kỳ thị chủng tộc", "high"],
                ["phân biệt chủng tộc", "discrimination", "Phân biệt chủng tộc", "high"],
                ["phân biệt màu da", "discrimination", "Phân biệt màu da", "high"],
                ["tôn giáo", "religion", "Nội dung tôn giáo nhạy cảm", "medium"],
                ["blasphemy", "religion", "Blasphemous content", "high"],
                ["xúc phạm tôn giáo", "religion", "Xúc phạm tôn giáo", "high"],
                ["phỉ báng", "religion", "Phỉ báng tôn giáo", "high"],
                ["báng bổ", "religion", "Báng bổ tôn giáo", "high"],
                ["ma túy", "drugs", "Nội dung về ma túy", "high"],
                ["drugs", "drugs", "Drug content", "high"],
                ["cocaine", "drugs", "Cocaine reference", "high"],
                ["heroin", "drugs", "Heroin reference", "high"],
                ["cần sa", "drugs", "Nội dung về cần sa", "high"],
                ["chất gây nghiện", "drugs", "Chất gây nghiện", "high"],
                ["vũ khí", "weapons", "Nội dung về vũ khí", "medium"],
                ["súng", "weapons", "Hình ảnh súng đạn", "medium"],
                ["đạn", "weapons", "Đạn dược", "medium"],
                ["bom", "weapons", "Chất nổ", "high"],
                ["mìn", "weapons", "Mìn nổ", "high"],
                ["weapons", "weapons", "Weapon content", "medium"],
                ["lừa đảo", "scam", "Nội dung lừa đảo", "high"],
                ["scam", "scam", "Scam content", "high"],
                ["hack", "scam", "Hack content", "medium"],
                ["cheat", "scam", "Cheat content", "medium"],
                ["gian lận", "scam", "Nội dung gian lận", "high"],
                ["quấy rối", "harassment", "Nội dung quấy rối", "high"],
                ["harassment", "harassment", "Harassment content", "high"],
                ["bắt nạt", "harassment", "Nội dung bắt nạt", "high"],
                ["bullying", "harassment", "Bullying content", "high"],
                ["stalking", "harassment", "Stalking content", "high"],
                ["xúc phạm", "offensive", "Nội dung xúc phạm", "medium"],
                ["offensive", "offensive", "Offensive content", "medium"],
                ["chửi bới", "offensive", "Ngôn từ chửi bới", "medium"],
                ["thô tục", "offensive", "Ngôn từ thô tục", "medium"],
                ["nhạy cảm", "offensive", "Nội dung nhạy cảm", "medium"]
            ];

            const placeholders = defaults.map(() => '(?, ?, ?, ?)').join(', ');
            const values = defaults.flat();

            await mariaClient.query(
                `INSERT IGNORE INTO image_blacklist (keyword, category, description, severity) VALUES ${placeholders}`,
                values
            );

            logger.info('MARIADB', `Added ${defaults.length} default blacklist keywords`);
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error initializing default blacklist:', error);
            return false;
        }
    }
}

module.exports = new MariaBlacklistDB();
