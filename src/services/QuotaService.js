const logger = require('../utils/logger.js');
const QuotaDB = require('./database/QuotaDB.js');
const RoleService = require('./RoleService.js');
const { ROLE_LIMITS, QUOTA_PERIOD_DAYS } = require('../config/constants.js');
const DAY_MS = 86400000;
const PERIOD_MS = QUOTA_PERIOD_DAYS * DAY_MS;

class QuotaService {
  constructor() {
    this.roleLimits = ROLE_LIMITS;
    const { ROLE_IMAGE_LIMITS } = require('../config/constants.js');
    this.roleImageLimits = ROLE_IMAGE_LIMITS || { owner: -1, admin: -1, pro: 25, user: 10 };
    this.ownerId = process.env.OWNER_ID?.trim() || null;
  }

  async initializeUserMessageData(userId) {
    try {
      const existing = await QuotaDB.getUserQuota(userId);
      if (existing) return existing;

      const role = await RoleService.getUserRole(userId);
      const limitPeriod = this.roleLimits[role] || 600;
      const imageLimitPeriod = this.roleImageLimits[role] !== undefined ? this.roleImageLimits[role] : 10;

      await QuotaDB.createUserQuota(userId, limitPeriod, imageLimitPeriod, Date.now());

      return await QuotaDB.getUserQuota(userId);
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi khởi tạo quota cho ${userId}:`, error);
      throw error;
    }
  }

  async getUserMessageData(userId) {
    try {
      let messageData = await QuotaDB.getUserQuota(userId);

      if (!messageData) {
        return await this.initializeUserMessageData(userId);
      }

      await this.checkAndResetLimits(userId);
      return await QuotaDB.getUserQuota(userId);
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi lấy quota cho ${userId}:`, error);
      throw error;
    }
  }

  async checkAndResetLimits(userId) {
    try {
      const messageData = await QuotaDB.getUserQuota(userId);
      if (!messageData) return;

      const now = Date.now();
      const periodStart = messageData.periodStart || messageData.createdAt;

      if (now - periodStart > PERIOD_MS) {
        await QuotaDB.resetCurrentUsage(userId, now);
      }
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi reset quota cho ${userId}:`, error);
    }
  }

  async canUseMessages(userId, estimatedMessages = 1) {
    try {
      const messageData = await this.getUserMessageData(userId);
      const { messageUsage, limits } = messageData;

      const role = await RoleService.getUserRole(userId);

      if (role === 'owner' || role === 'admin' || limits.period === -1) {
        return { allowed: true, remaining: -1, role, current: messageUsage.current, limit: -1 };
      }

      const remaining = limits.period - messageUsage.current;
      return {
        allowed: remaining >= estimatedMessages,
        remaining, role,
        current: messageUsage.current,
        limit: limits.period,
        estimated: estimatedMessages
      };
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi kiểm tra quota cho ${userId}:`, error);
      return { allowed: true, remaining: 0, role: 'user', error: error.message };
    }
  }

  async canUseTokens(userId) {
    return this.canUseMessages(userId, 1);
  }
  
  async canUseImages(userId, estimatedImages = 1) {
    try {
      const messageData = await this.getUserMessageData(userId);
      const { imageUsage, limits } = messageData;

      const role = await RoleService.getUserRole(userId);

      if (role === 'owner' || role === 'admin' || limits.imagePeriod === -1) {
        return { allowed: true, remaining: -1, role, current: imageUsage.current, limit: -1 };
      }

      const remaining = limits.imagePeriod - imageUsage.current;
      return {
        allowed: remaining >= estimatedImages,
        remaining, role,
        current: imageUsage.current,
        limit: limits.imagePeriod,
        estimated: estimatedImages
      };
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi kiểm tra image quota cho ${userId}:`, error);
      return { allowed: true, remaining: 0, role: 'user', error: error.message };
    }
  }

  async recordMessageUsage(userId, messagesUsed = 1) {
    try {
      await QuotaDB.recordUsage(userId, messagesUsed, Date.now());
      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi ghi nhận usage cho ${userId}:`, error);
      return false;
    }
  }

  async recordTokenUsage(userId) {
    return await this.recordMessageUsage(userId, 1);
  }
  
  async recordImageUsage(userId, imagesUsed = 1) {
    try {
      await QuotaDB.recordImageUsage(userId, imagesUsed, Date.now());
      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi ghi nhận image usage cho ${userId}:`, error);
      return false;
    }
  }

  async addQuota(userId, amount) {
    try {
      await this.getUserMessageData(userId);
      await QuotaDB.addQuotaLimit(userId, amount, Date.now());
      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi cộng thêm quota cho ${userId}:`, error);
      throw error;
    }
  }

  async getUserMessageStats(userId) {
    try {
      const messageData = await this.getUserMessageData(userId);
      const role = await RoleService.getUserRole(userId);
      const periodStart = messageData.periodStart || messageData.createdAt;
      const timeRemaining = PERIOD_MS - (Date.now() - periodStart);

      return {
        userId, role,
        usage: { current: messageData.messageUsage.current, total: messageData.messageUsage.total },
        imageUsage: { current: messageData.imageUsage.current, total: messageData.imageUsage.total },
        limits: { period: messageData.limits.period, imagePeriod: messageData.limits.imagePeriod },
        remaining: {
          messages: messageData.limits.period === -1 ? -1 : messageData.limits.period - messageData.messageUsage.current,
          images: messageData.limits.imagePeriod === -1 ? -1 : messageData.limits.imagePeriod - messageData.imageUsage.current,
          days: Math.max(0, Math.ceil(timeRemaining / DAY_MS))
        },
        periodStart: messageData.periodStart,
        nextReset: periodStart + PERIOD_MS
      };
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi lấy thống kê cho ${userId}:`, error);
      throw error;
    }
  }

  async resetUserQuota(userId) {
    try {
      await QuotaDB.resetCurrentUsage(userId, Date.now());
      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi reset quota cho ${userId}:`, error);
      throw error;
    }
  }

  async syncQuotaForRole(userId, role) {
    try {
      const newLimit = this.roleLimits[role] ?? 600;
      const newImageLimit = this.roleImageLimits[role] ?? 10;
      await this.initializeUserMessageData(userId);
      await QuotaDB.setQuotaLimit(userId, newLimit, newImageLimit, Date.now());
      logger.info('QUOTA_SERVICE', `Đã đồng bộ quota cho ${userId}: role=${role}, limit=${newLimit}, imageLimit=${newImageLimit}`);
      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi đồng bộ quota cho ${userId}:`, error);
      throw error;
    }
  }

  async getSystemStats() {
    try {
      const allUsers = await QuotaDB.getAllUsers();

      const byRole = { owner: 0, admin: 0, pro: 0, user: 0 };
      let currentTotal = 0, grandTotal = 0;

      const usersData = [];

      for (const row of allUsers) {
        byRole[row.role] = (byRole[row.role] || 0) + 1;
        currentTotal += row.current_usage || 0;
        grandTotal += row.total_usage || 0;

        usersData.push({
          userId: row.user_id,
          role: row.role,
          current: row.current_usage || 0,
          total: row.total_usage || 0
        });
      }

      return {
        totalUsers: allUsers.length,
        byRole,
        totalMessagesUsed: { current: currentTotal, total: grandTotal },
        topUsers: usersData
          .sort((a, b) => b.current - a.current)
          .slice(0, 10)
      };
    } catch (error) {
      logger.error('QUOTA_SERVICE', 'Lỗi khi lấy thống kê hệ thống:', error);
      throw error;
    }
  }

  async initializeCollection() {
    try {
      await QuotaDB.initTables();
    } catch (error) {
      logger.error('QUOTA_SERVICE', 'Lỗi khi khởi tạo bảng MariaDB user_quotas:', error);
      throw error;
    }
  }
}

module.exports = new QuotaService();