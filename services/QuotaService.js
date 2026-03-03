const mongoClient = require('./database/mongoClient.js');
const logger = require('../utils/logger.js');

const VALID_ROLES = ['owner', 'admin', 'helper', 'user'];
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 86400000;

class QuotaService {
  constructor() {
    this.roleLimits = { owner: -1, user: 600 };
    this.ownerId = process.env.OWNER_ID?.trim() || null;
  }

  async getMessageCollection() {
    return mongoClient.getDb().collection('user_quotas');
  }

  async getProfileCollection() {
    return mongoClient.getDb().collection('user_profiles');
  }

  async initializeUserMessageData(userId) {
    try {
      const collection = await this.getMessageCollection();
      const existing = await collection.findOne({ userId });
      if (existing) return existing;

      const profileCollection = await this.getProfileCollection();
      let role = 'user';
      if (this.ownerId && userId === this.ownerId) {
        role = 'owner';
      } else {
        const profile = await profileCollection.findOne({ _id: userId });
        if (profile?.data?.role) role = profile.data.role;
      }

      const now = Date.now();
      const messageData = {
        userId, role,
        messageUsage: { current: 0, total: 0 },
        limits: { period: this.roleLimits[role] },
        periodStart: now, createdAt: now, updatedAt: now
      };

      await collection.insertOne(messageData);

      if (role !== 'user') {
        await profileCollection.updateOne(
          { _id: userId },
          { $set: { 'data.role': role } },
          { upsert: true }
        );
      }

      return messageData;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi khởi tạo quota cho ${userId}:`, error);
      throw error;
    }
  }

  async getUserMessageData(userId) {
    try {
      const collection = await this.getMessageCollection();
      let messageData = await collection.findOne({ userId });

      if (!messageData) {
        return await this.initializeUserMessageData(userId);
      }

      await this.checkAndResetLimits(userId);
      return await collection.findOne({ userId });
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi lấy quota cho ${userId}:`, error);
      throw error;
    }
  }

  async checkAndResetLimits(userId) {
    try {
      const collection = await this.getMessageCollection();
      const messageData = await collection.findOne({ userId });
      if (!messageData) return;

      const now = Date.now();
      const periodStart = messageData.periodStart || messageData.createdAt;

      if (now - periodStart > PERIOD_MS) {
        await collection.updateOne(
          { userId },
          { $set: { 'messageUsage.current': 0, periodStart: now, updatedAt: now } }
        );
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
      const collection = await this.getMessageCollection();
      await collection.updateOne(
        { userId },
        {
          $inc: { 'messageUsage.current': messagesUsed, 'messageUsage.total': messagesUsed },
          $set: { updatedAt: Date.now() }
        },
        { upsert: true }
      );
      return true;
    } catch (error) {
      logger.error('QUOTA_SERVICE', `Lỗi khi ghi nhận usage cho ${userId}:`, error);
      return false;
    }
  }

  async recordTokenUsage(userId) {
    return this.recordMessageUsage(userId, 1);
  }

  async setUserRole(userId, role) {
    try {
      if (!VALID_ROLES.includes(role)) throw new Error(`Vai trò không hợp lệ: ${role}`);

      const [collection, profileCollection] = await Promise.all([
        this.getMessageCollection(),
        this.getProfileCollection()
      ]);

      const now = Date.now();
      await Promise.all([
        collection.updateOne(
          { userId },
          { $set: { role, 'limits.period': this.roleLimits[role], updatedAt: now } },
          { upsert: true }
        ),
        profileCollection.updateOne(
          { _id: userId },
          { $set: { 'data.role': role } },
          { upsert: true }
        )
      ]);

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
      const collection = await this.getMessageCollection();
      const now = Date.now();
      await collection.updateOne(
        { userId },
        { $set: { 'messageUsage.current': 0, periodStart: now, updatedAt: now } }
      );
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

      const byRole = { owner: 0, admin: 0, helper: 0, user: 0 };
      let currentTotal = 0, grandTotal = 0;

      for (const user of allUsers) {
        byRole[user.role] = (byRole[user.role] || 0) + 1;
        currentTotal += user.messageUsage?.current || 0;
        grandTotal += user.messageUsage?.total || 0;
      }

      return {
        totalUsers: allUsers.length,
        byRole,
        totalMessagesUsed: { current: currentTotal, total: grandTotal },
        topUsers: allUsers
          .sort((a, b) => (b.messageUsage?.current || 0) - (a.messageUsage?.current || 0))
          .slice(0, 10)
          .map(u => ({
            userId: u.userId, role: u.role,
            current: u.messageUsage?.current || 0,
            total: u.messageUsage?.total || 0
          }))
      };
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
      }

      const col = db.collection('user_quotas');
      await col.createIndex({ userId: 1 }, { unique: true });
      await col.createIndex({ role: 1 });
      await col.createIndex({ 'messageUsage.total': -1 });
    } catch (error) {
      logger.error('QUOTA_SERVICE', 'Lỗi khi khởi tạo collection:', error);
      throw error;
    }
  }
}

module.exports = new QuotaService();