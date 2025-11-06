const mongoClient = require('./mongoClient.js');
const logger = require('../utils/logger.js');

/**
 * Service quản lý giới hạn lượt nhắn tin và vai trò người dùng
 */
class MessageService {
  constructor() {
    this.roleLimits = {
      owner: -1,
      admin: 1000,
      helper: 500,
      user: 100
    };

    this.ownerId = process.env.OWNER_ID ? process.env.OWNER_ID.trim() : null;
    
    logger.info('TOKEN_SERVICE', `Khởi tạo TokenService với owner ID: ${this.ownerId || 'không có'}`);
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
          daily: 0,
          weekly: 0,
          monthly: 0,
          total: 0
        },
        limits: {
          daily: this.roleLimits[role]
        },
        lastReset: {
          daily: Date.now(),
          weekly: Date.now(),
          monthly: Date.now()
        },
        history: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await collection.insertOne(messageData);
      logger.info('TOKEN_SERVICE', `Khởi tạo quota cho user ${userId} với role ${role}`);

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
      const oneDay = 24 * 60 * 60 * 1000;
      const oneWeek = 7 * oneDay;
      const oneMonth = 30 * oneDay;

      const updates = {};
      let needsUpdate = false;

      if (now - messageData.lastReset.daily > oneDay) {
        updates['messageUsage.daily'] = 0;
        updates['lastReset.daily'] = now;
        needsUpdate = true;
        logger.info('TOKEN_SERVICE', `Reset quota hàng ngày cho user ${userId}`);
      }

      if (now - messageData.lastReset.weekly > oneWeek) {
        updates['messageUsage.weekly'] = 0;
        updates['lastReset.weekly'] = now;
        needsUpdate = true;
      }

      if (now - messageData.lastReset.monthly > oneMonth) {
        updates['messageUsage.monthly'] = 0;
        updates['lastReset.monthly'] = now;
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.updatedAt = now;
        await collection.updateOne({ userId }, { $set: updates });
      }
    } catch (error) {
      logger.error('TOKEN_SERVICE', `Lỗi khi reset quota cho ${userId}:`, error);
    }
  }

  async canUseMessages(userId, estimatedMessages = 1) {
    try {
      const messageData = await this.getUserMessageData(userId);

      if (messageData.role === 'owner' || messageData.limits.daily === -1) {
        return {
          allowed: true,
          remaining: -1,
          role: messageData.role,
          current: messageData.messageUsage.daily,
          limit: -1
        };
      }

      const remaining = messageData.limits.daily - messageData.messageUsage.daily;
      const allowed = remaining >= estimatedMessages;

      return {
        allowed,
        remaining,
        role: messageData.role,
        current: messageData.messageUsage.daily,
        limit: messageData.limits.daily,
        estimated: estimatedMessages
      };
    } catch (error) {
      logger.error('TOKEN_SERVICE', `Lỗi khi kiểm tra quota cho ${userId}:`, error);
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

      const historyEntry = {
        messages: messagesUsed,
        operation,
        timestamp: now
      };

      await collection.updateOne(
        { userId },
        {
          $inc: {
            'messageUsage.daily': messagesUsed,
            'messageUsage.weekly': messagesUsed,
            'messageUsage.monthly': messagesUsed,
            'messageUsage.total': messagesUsed
          },
          $push: {
            history: {
              $each: [historyEntry],
              $slice: -100
            }
          },
          $set: {
            updatedAt: now
          }
        },
        { upsert: true }
      );

      logger.debug('TOKEN_SERVICE', `Ghi nhận ${messagesUsed} lượt cho user ${userId} (${operation})`);

      return true;
    } catch (error) {
      logger.error('TOKEN_SERVICE', `Lỗi khi ghi nhận usage cho ${userId}:`, error);
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
            'limits.daily': this.roleLimits[role],
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

      logger.info('TOKEN_SERVICE', `Đặt role ${role} cho user ${userId}`);
      return true;
    } catch (error) {
      logger.error('MESSAGE_SERVICE', `Lỗi khi đặt role cho ${userId}:`, error);
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
      logger.error('TOKEN_SERVICE', `Lỗi khi lấy role của ${userId}:`, error);
      return 'user';
    }
  }

  async getUserMessageStats(userId) {
    try {
      const messageData = await this.getUserMessageData(userId);

      return {
        userId,
        role: messageData.role,
        usage: {
          daily: messageData.messageUsage.daily,
          weekly: messageData.messageUsage.weekly,
          monthly: messageData.messageUsage.monthly,
          total: messageData.messageUsage.total
        },
        limits: {
          daily: messageData.limits.daily
        },
        remaining: {
          daily: messageData.limits.daily === -1 ? -1 : messageData.limits.daily - messageData.messageUsage.daily
        },
        lastReset: messageData.lastReset,
        recentHistory: messageData.history.slice(-10)
      };
    } catch (error) {
      logger.error('TOKEN_SERVICE', `Lỗi khi lấy thống kê cho ${userId}:`, error);
      throw error;
    }
  }

  async resetUserMessages(userId, resetType = 'daily') {
    try {
      const collection = await this.getMessageCollection();
      const now = Date.now();

      const updates = {
        updatedAt: now
      };

      switch (resetType) {
        case 'daily':
          updates['messageUsage.daily'] = 0;
          updates['lastReset.daily'] = now;
          break;
        case 'weekly':
          updates['messageUsage.weekly'] = 0;
          updates['lastReset.weekly'] = now;
          break;
        case 'monthly':
          updates['messageUsage.monthly'] = 0;
          updates['lastReset.monthly'] = now;
          break;
        case 'all':
          updates['messageUsage.daily'] = 0;
          updates['messageUsage.weekly'] = 0;
          updates['messageUsage.monthly'] = 0;
          updates['lastReset.daily'] = now;
          updates['lastReset.weekly'] = now;
          updates['lastReset.monthly'] = now;
          break;
      }

      await collection.updateOne({ userId }, { $set: updates });
      logger.info('TOKEN_SERVICE', `Reset ${resetType} quota cho user ${userId}`);

      return true;
    } catch (error) {
      logger.error('MESSAGE_SERVICE', `Lỗi khi reset messages cho ${userId}:`, error);
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
        stats.totalMessagesUsed.daily += user.messageUsage.daily || 0;
        stats.totalMessagesUsed.weekly += user.messageUsage.weekly || 0;
        stats.totalMessagesUsed.monthly += user.messageUsage.monthly || 0;
        stats.totalMessagesUsed.total += user.messageUsage.total || 0;
      });

      stats.topUsers = allUsers
        .sort((a, b) => (b.messageUsage.daily || 0) - (a.messageUsage.daily || 0))
        .slice(0, 10)
        .map(u => ({
          userId: u.userId,
          role: u.role,
          daily: u.messageUsage.daily,
          total: u.messageUsage.total
        }));

      return stats;
    } catch (error) {
      logger.error('TOKEN_SERVICE', 'Lỗi khi lấy thống kê hệ thống:', error);
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

      logger.info('TOKEN_SERVICE', 'Đã khởi tạo collection và indexes cho TokenService');
    } catch (error) {
      logger.error('TOKEN_SERVICE', 'Lỗi khi khởi tạo collection:', error);
      throw error;
    }
  }
}

module.exports = new MessageService();

