const logger = require('../utils/logger.js');
const QuotaDB = require('./database/QuotaDB.js');
const UserProfileDB = require('./database/UserProfileDB.js');
const { ROLE_LIMITS, USER_ROLES, QUOTA_PERIOD_DAYS } = require('../config/constants.js');

const VALID_ROLES = Object.values(USER_ROLES);
const DAY_MS = 86400000;
const PERIOD_MS = QUOTA_PERIOD_DAYS * DAY_MS;

class QuotaService {
  constructor() {
    this.roleLimits = ROLE_LIMITS;
    this.ownerId = process.env.OWNER_ID?.trim() || null;
  }

  async initializeUserMessageData(userId) {
    try {
      const existing = await QuotaDB.getUserQuota(userId);
      if (existing) return existing;

      let role = 'user';
      if (this.ownerId && userId === this.ownerId) {
        role = 'owner';
      }

      const now = Date.now();
      const limitPeriod = this.roleLimits[role] || 600;

      await QuotaDB.createUserQuota(userId, role, limitPeriod, now);

      if (role !== 'user') {
        await profileCollection.updateOne(
          { _id: userId },
          { $set: { 'data.role': role } },
          { upsert: true }
        );
      }

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
      const { role, messageUsage, limits } = messageData;

      if (role === 'owner' || limits.period === -1) {
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

  async setUserRole(userId, role) {
    try {
      if (!VALID_ROLES.includes(role)) throw new Error(`Vai trò không hợp lệ: ${role}`);

      const now = Date.now();
      const limitPeriod = this.roleLimits[role] || 600;

      await QuotaDB.updateUserRole(userId, role, limitPeriod, now);

      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi đặt role cho ${userId}:`, error);
      throw error;
    }
  }

  async getUserRole(userId) {
    try {
      if (this.ownerId && userId === this.ownerId) return 'owner';
      const messageData = await this.getUserMessageData(userId);
      return messageData.role || 'user';
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi lấy role của ${userId}:`, error);
      return 'user';
    }
  }

  async getUserMessageStats(userId) {
    try {
      const messageData = await this.getUserMessageData(userId);
      const periodStart = messageData.periodStart || messageData.createdAt;
      const timeRemaining = PERIOD_MS - (Date.now() - periodStart);

      return {
        userId, role: messageData.role,
        usage: { current: messageData.messageUsage.current, total: messageData.messageUsage.total },
        limits: { period: messageData.limits.period },
        remaining: {
          messages: messageData.limits.period === -1 ? -1 : messageData.limits.period - messageData.messageUsage.current,
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

  async getSystemStats() {
    try {
      const allUsers = await QuotaDB.getAllUsers();

      const byRole = { owner: 0, admin: 0, helper: 0, user: 0 };
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