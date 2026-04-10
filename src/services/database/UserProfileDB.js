const MariaModDB = require('./MariaModDB');
const logger = require('../../utils/logger');
const Validators = require('../../utils/validators');

class UserProfileDB {
  async getUserProfile(userId) {
    try {
      Validators.validateUserIdOrThrow(userId, 'getUserProfile');
      
      const profile = await MariaModDB.getUserProfile(userId);
      const economy = await MariaModDB.getUserEconomy(userId);

      const parsedCosmetics = typeof profile.cosmetics === 'string' ? JSON.parse(profile.cosmetics || '{}') : (profile.cosmetics || {});
      const parsedExtraData = typeof profile.extra_data === 'string' ? JSON.parse(profile.extra_data || '{}') : (profile.extra_data || {});

      return {
        _id: userId,
        data: {
          global_xp: profile.global_xp,
          global_level: profile.global_level,
          profile: {
            bio: profile.bio || "No bio written.",
            color: profile.color,
            background: profile.background,
            badges: typeof profile.badges === 'string' ? JSON.parse(profile.badges || '[]') : (profile.badges || []),
            inventory: typeof profile.inventory === 'string' ? JSON.parse(profile.inventory || '[]') : (profile.inventory || []),
            social: typeof profile.social === 'string' ? JSON.parse(profile.social || '{}') : (profile.social || {}),
            ...parsedCosmetics
          },
          economy: {
            wallet: economy.wallet,
            bank: economy.bank,
            shard: economy.shards,
            streak: { 
              current: economy.streak_current, 
              alltime: economy.streak_alltime, 
              timestamp: economy.streak_timestamp 
            }
          },
          ...parsedExtraData
        }
      };
    } catch (error) {
      logger.error('mariadb_wrapper', 'Error getting user profile:', error);
      throw error;
    }
  }

  async updateUserProfile(userId, updateData) {
    // Đây là lớp proxy cho object $set từ các lệnh mongo cũ. Nhưng trong repo hiện không còn phần nào dùng trực tiếp định dạng này ngoài một số luồng nội bộ.
    // Nếu vẫn có chỗ gọi, hàm này sẽ tạm trả về false hoặc map lại dữ liệu.
    logger.warn('mariadb_wrapper', 'updateUserProfile is deprecated through UserProfileDB. Use MariaModDB directly instead.');
    return false;
  }

  async updateUserEconomy(userId, resourceType, amount) {
    try {
      Validators.validateUserIdOrThrow(userId, 'updateUserEconomy');
      
      const isIncrement = true;
      const colMap = {
        'wallet': 'wallet',
        'bank': 'bank',
        'shard': 'shards'
      };
      
      const targetCol = colMap[resourceType];
      if (!targetCol) return null;
      
      const success = await MariaModDB.updateUserEconomyCol(userId, targetCol, amount, isIncrement);
      if (!success) return null;

      const economy = await MariaModDB.getUserEconomy(userId);
      return {
        wallet: economy.wallet,
        bank: economy.bank,
        shard: economy.shards,
        streak: { 
          current: economy.streak_current, 
          alltime: economy.streak_alltime, 
          timestamp: economy.streak_timestamp 
        }
      };
    } catch (error) {
      logger.error('mariadb_wrapper', 'Error updating user economy:', error);
      return null;
    }
  }
}

module.exports = new UserProfileDB();