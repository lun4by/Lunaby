const mongoClient = require('./mongoClient.js');
const logger = require('../utils/logger.js');

/**
 * Service quản lý giới hạn lượt nhắn tin và vai trò người dùng
 */
class QuotaService {
  constructor() {
    this.roleLimits = {
      owner: -1,
      user: 600
    };

    this.quotaPeriodDays = 30;
    this.ownerId = process.env.OWNER_ID ? process.env.OWNER_ID.trim() : null;
    
    logger.info('QUOTA_SERVICE', `Khởi tạo QuotaService với owner ID: ${this.ownerId || 'không có'}`);
  }

  async getMessageCollection() {
    const db = mongoClient.getDb();
    return db.collection('user_quotas');
  }

  async getProfileCollection() {
    const db = mongoClient.getDb();
    return db.collection('user_profiles');
  }

  async initializeUserMessageData(userId) {
    try {
      const collection = await this.getMessageCollection();
      const profileCollection = await this.getProfileCollection();

      // Kiểm tra xem user đã có dữ liệu chưa
      const existing = await collection.findOne({ userId });
      if (existing) {
        return existing;
      }

      let role = 'user';
      if (this.ownerId && userId === this.ownerId) {
        role = 'owner';
      } else {
        const profile = await profileCollection.findOne({ _id: userId });
        if (profile?.data?.role) {
          role = profile.data.role;
        }
      }

      const messageData = {
        userId,
        role,
        messageUsage: {
          current: 0,
          total: 0
        },
        limits: {
          period: this.roleLimits[role]
        },
        periodStart: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await collection.insertOne(messageData);
      logger.info('QUOTA_SERVICE', `Khởi tạo quota cho user ${userId} với role ${role}`);

      if (role !== 'user') {
        await profileCollection.updateOne(
          { _id: userId },
          { $set: { 'data.role': role } },
          { upsert: true }
        );
      }

      return messageData;
    } catch (error) {
      logger.error('TOKEN_SERVICE', `Lỗi khi khởi tạo quota cho ${userId}:`, error);
      throw error;
    }
  }

  async getUserMessageData(userId) {
    try {
      const collection = await this.getMessageCollection();
      let messageData = await collection.findOne({ userId });

      if (!messageData) {
        messageData = await this.initializeUserMessageData(userId);
      } else {
        await this.checkAndResetLimits(userId);
        messageData = await collection.findOne({ userId });
      }

      return messageData;
    } catch (error) {
      logger.error('TOKEN_SERVICE', `Lỗi khi lấy quota cho ${userId}:`, error);
      throw error;
    }
  }

  async checkAndResetLimits(userId) {
    try {
      const collection = await this.getMessageCollection();
      const messageData = await collection.findOne({ userId });

      if (!messageData) return;

      const now = Date.now();
      const periodMs = this.quotaPeriodDays * 24 * 60 * 60 * 1000;
      const periodStart = messageData.periodStart || messageData.createdAt;

      if (now - periodStart > periodMs) {
        await collection.updateOne(
          { userId },
          {
            $set: {
              'messageUsage.current': 0,
              periodStart: now,
              updatedAt: now
            }
          }
        );
        logger.info('QUOTA_SERVICE', `Reset quota 30 ngày cho user ${userId}`);
      }
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi reset quota cho ${userId}:`, error);
    }
  }

  async canUseMessages(userId, estimatedMessages = 1) {
    try {
      const messageData = await this.getUserMessageData(userId);

      if (messageData.role === 'owner' || messageData.limits.period === -1) {
        return {
          allowed: true,
          remaining: -1,
          role: messageData.role,
          current: messageData.messageUsage.current,
          limit: -1
        };
      }

      const remaining = messageData.limits.period - messageData.messageUsage.current;
      const allowed = remaining >= estimatedMessages;

      return {
        allowed,
        remaining,
        role: messageData.role,
        current: messageData.messageUsage.current,
        limit: messageData.limits.period,
        estimated: estimatedMessages
      };
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi kiểm tra quota cho ${userId}:`, error);
      return { allowed: true, remaining: 0, role: 'user', error: error.message };
    }
  }

  async canUseTokens(userId, estimatedTokens = 1) {
    return this.canUseMessages(userId, 1);
  }

  async recordMessageUsage(userId, messagesUsed = 1, operation = 'chat') {
    try {
      const collection = await this.getMessageCollection();
      const now = Date.now();

      await collection.updateOne(
        { userId },
        {
          $inc: {
            'messageUsage.current': messagesUsed,
            'messageUsage.total': messagesUsed
          },
          $set: {
            updatedAt: now
          }
        },
        { upsert: true }
      );

      logger.debug('QUOTA_SERVICE', `Ghi nhận ${messagesUsed} lượt cho user ${userId} (${operation})`);

      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi ghi nhận usage cho ${userId}:`, error);
      return false;
    }
  }

  async recordTokenUsage(userId, tokensUsed, operation = 'chat') {
    return this.recordMessageUsage(userId, 1, operation);
  }

  async setUserRole(userId, role) {
    try {
      if (!['owner', 'admin', 'helper', 'user'].includes(role)) {
        throw new Error(`Vai trò không hợp lệ: ${role}`);
      }

      const collection = await this.getMessageCollection();
      const profileCollection = await this.getProfileCollection();
      const now = Date.now();

      await collection.updateOne(
        { userId },
        {
          $set: {
            role,
            'limits.period': this.roleLimits[role],
            updatedAt: now
          }
        },
        { upsert: true }
      );

      await profileCollection.updateOne(
        { _id: userId },
        { $set: { 'data.role': role } },
        { upsert: true }
      );

      logger.info('QUOTA_SERVICE', `Đặt role ${role} cho user ${userId}`);
      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi đặt role cho ${userId}:`, error);
      throw error;
    }
  }

  async getUserRole(userId) {
    try {
      if (this.ownerId && userId === this.ownerId) {
        return 'owner';
      }

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
      const now = Date.now();
      const periodMs = this.quotaPeriodDays * 24 * 60 * 60 * 1000;
      const periodStart = messageData.periodStart || messageData.createdAt;
      const timeRemaining = periodMs - (now - periodStart);
      const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));

      return {
        userId,
        role: messageData.role,
        usage: {
          current: messageData.messageUsage.current,
          total: messageData.messageUsage.total
        },
        limits: {
          period: messageData.limits.period
        },
        remaining: {
          messages: messageData.limits.period === -1 ? -1 : messageData.limits.period - messageData.messageUsage.current,
          days: daysRemaining > 0 ? daysRemaining : 0
        },
        periodStart: messageData.periodStart,
        nextReset: periodStart + periodMs
      };
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi lấy thống kê cho ${userId}:`, error);
      throw error;
    }
  }

  async resetUserQuota(userId) {
    try {
      const collection = await this.getMessageCollection();
      const now = Date.now();

      await collection.updateOne(
        { userId },
        {
          $set: {
            'messageUsage.current': 0,
            periodStart: now,
            updatedAt: now
          }
        }
      );
      
      logger.info('QUOTA_SERVICE', `Reset quota cho user ${userId}`);
      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi reset quota cho ${userId}:`, error);
      throw error;
    }
  }

  async getSystemStats() {
    try {
      const collection = await this.getMessageCollection();
      
      const allUsers = await collection.find({}).toArray();
      
      const stats = {
        totalUsers: allUsers.length,
        byRole: {
          owner: 0,
          admin: 0,
          helper: 0,
          user: 0
        },
        totalMessagesUsed: {
          daily: 0,
          weekly: 0,
          monthly: 0,
          total: 0
        },
        topUsers: []
      };

      allUsers.forEach(user => {
        stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;
        stats.totalMessagesUsed.current += user.messageUsage?.current || 0;
        stats.totalMessagesUsed.total += user.messageUsage?.total || 0;
      });
      
      delete stats.totalMessagesUsed.daily;
      delete stats.totalMessagesUsed.weekly;
      delete stats.totalMessagesUsed.monthly;

      stats.topUsers = allUsers
        .sort((a, b) => (b.messageUsage?.current || 0) - (a.messageUsage?.current || 0))
        .slice(0, 10)
        .map(u => ({
          userId: u.userId,
          role: u.role,
          current: u.messageUsage?.current || 0,
          total: u.messageUsage?.total || 0
        }));

      return stats;
    } catch (error) {
      logger.error('QUOTA_SERVICE', 'Lỗi khi lấy thống kê hệ thống:', error);
      throw error;
    }
  }

  async initializeCollection() {
    try {
      const db = mongoClient.getDb();

      const collections = await db.listCollections({ name: 'user_quotas' }).toArray();
      if (collections.length === 0) {
        await db.createCollection('user_quotas');
        logger.info('TOKEN_SERVICE', 'Đã tạo collection user_quotas');
      }

      await db.collection('user_quotas').createIndex({ userId: 1 }, { unique: true });
      await db.collection('user_quotas').createIndex({ role: 1 });
      await db.collection('user_quotas').createIndex({ 'messageUsage.total': -1 });

      logger.info('QUOTA_SERVICE', 'Đã khởi tạo collection và indexes cho QuotaService');
    } catch (error) {
      logger.error('QUOTA_SERVICE', 'Lỗi khi khởi tạo collection:', error);
      throw error;
    }
  }
}

module.exports = new QuotaService();

