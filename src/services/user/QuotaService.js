const logger = require('../../utils/logger.js');
const QuotaDB = require('../database/QuotaDB.js');
const RoleService = require('./RoleService.js');
const { ROLE_LIMITS, ROLE_IMAGE_LIMITS, QUOTA_PERIOD_DAYS, USER_ROLES } = require('../../config/constants.js');
const DAY_MS = 86400000;
const PERIOD_MS = QUOTA_PERIOD_DAYS * DAY_MS;
const DEFAULT_ROLE = USER_ROLES.USER;
const DEFAULT_MESSAGE_LIMIT = ROLE_LIMITS[DEFAULT_ROLE] ?? 0;
const DEFAULT_IMAGE_LIMIT = ROLE_IMAGE_LIMITS[DEFAULT_ROLE] ?? 0;
const LEGACY_ROLE_LIMITS = { user: [10] };
const LEGACY_ROLE_IMAGE_LIMITS = { pro: [25], user: [10] };

class QuotaService {
  constructor() {
    this.roleLimits = ROLE_LIMITS || {};
    this.roleImageLimits = ROLE_IMAGE_LIMITS || {};
    this.ownerId = process.env.OWNER_ID?.trim() || null;
  }

  isPrivilegedRole(role) {
    return role === USER_ROLES.OWNER || role === USER_ROLES.ADMIN;
  }

  async initializeUserMessageData(userId) {
    try {
      const existing = await QuotaDB.getUserQuota(userId);
      if (existing) return existing;

      const role = await RoleService.getUserRole(userId);
      const limitPeriod = this.roleLimits[role] ?? DEFAULT_MESSAGE_LIMIT;
      const imageLimitPeriod = this.roleImageLimits[role] ?? DEFAULT_IMAGE_LIMIT;

      await QuotaDB.createUserQuota(userId, limitPeriod, imageLimitPeriod, Date.now());

      return await QuotaDB.getUserQuota(userId);
    } catch (error) {
      logger.error('quota_service', `Error while initializing quota for ${userId}:`, error);
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
      messageData = await QuotaDB.getUserQuota(userId);
      return await this.syncLegacyQuotaIfNeeded(userId, messageData);
    } catch (error) {
      logger.error('quota_service', `Error while fetching quota for ${userId}:`, error);
      throw error;
    }
  }

  async syncLegacyQuotaIfNeeded(userId, messageData) {
    if (!messageData) return messageData;

    const role = await RoleService.getUserRole(userId);
    const expectedLimit = this.roleLimits[role];
    const expectedImageLimit = this.roleImageLimits[role];
    const currentLimit = messageData.limits?.period;
    const currentImageLimit = messageData.limits?.imagePeriod;
    const shouldForceUnlimitedLimit = expectedLimit === -1 && currentLimit !== -1;
    const shouldForceUnlimitedImageLimit = expectedImageLimit === -1 && currentImageLimit !== -1;

    const shouldSyncLimit = expectedLimit !== undefined
      && currentLimit !== expectedLimit
      && LEGACY_ROLE_LIMITS[role]?.includes(currentLimit);

    const shouldSyncImageLimit = expectedImageLimit !== undefined
      && currentImageLimit !== expectedImageLimit
      && LEGACY_ROLE_IMAGE_LIMITS[role]?.includes(currentImageLimit);

    if (!shouldSyncLimit && !shouldSyncImageLimit && !shouldForceUnlimitedLimit && !shouldForceUnlimitedImageLimit) {
      return messageData;
    }

    const newLimit = (shouldSyncLimit || shouldForceUnlimitedLimit) ? expectedLimit : currentLimit;
    const newImageLimit = (shouldSyncImageLimit || shouldForceUnlimitedImageLimit) ? expectedImageLimit : currentImageLimit;

    await QuotaDB.setQuotaLimit(userId, newLimit, newImageLimit, Date.now());
    logger.info('quota_service',
      `Migrated legacy quota for ${userId}: role=${role}, limit ${currentLimit} -> ${newLimit}, imageLimit ${currentImageLimit} -> ${newImageLimit}`
    );

    return await QuotaDB.getUserQuota(userId);
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
      logger.error('quota_service', `Error while resetting quota for ${userId}:`, error);
    }
  }

  async canUseMessages(userId, estimatedMessages = 1) {
    try {
      const messageData = await this.getUserMessageData(userId);
      const { messageUsage, limits } = messageData;

      const role = await RoleService.getUserRole(userId);

      if (this.isPrivilegedRole(role) || limits.period === -1) {
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
      logger.error('quota_service', `Error while checking quota for ${userId}:`, error);
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

      if (this.isPrivilegedRole(role) || limits.imagePeriod === -1) {
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
      logger.error('quota_service', `Error while checking image quota for ${userId}:`, error);
      return { allowed: true, remaining: 0, role: 'user', error: error.message };
    }
  }

  async recordMessageUsage(userId, messagesUsed = 1) {
    try {
      const role = await RoleService.getUserRole(userId);
      if (this.isPrivilegedRole(role)) {
        return true;
      }

      await QuotaDB.recordUsage(userId, messagesUsed, Date.now());
      return true;
    } catch (error) {
      logger.error('quota_service', `Error while recording usage for ${userId}:`, error);
      return false;
    }
  }

  async recordTokenUsage(userId) {
    return await this.recordMessageUsage(userId, 1);
  }
  
  async recordImageUsage(userId, imagesUsed = 1) {
    try {
      const role = await RoleService.getUserRole(userId);
      if (this.isPrivilegedRole(role)) {
        return true;
      }

      await QuotaDB.recordImageUsage(userId, imagesUsed, Date.now());
      return true;
    } catch (error) {
      logger.error('quota_service', `Error while recording image usage for ${userId}:`, error);
      return false;
    }
  }

  async addQuota(userId, amount) {
    try {
      await this.getUserMessageData(userId);
      await QuotaDB.addQuotaLimit(userId, amount, Date.now());
      return true;
    } catch (error) {
      logger.error('quota_service', `Error while adding extra quota for ${userId}:`, error);
      throw error;
    }
  }

  async getUserMessageStats(userId) {
    try {
      const messageData = await this.getUserMessageData(userId);
      const role = await RoleService.getUserRole(userId);
      const periodStart = messageData.periodStart || messageData.createdAt;
      const timeRemaining = PERIOD_MS - (Date.now() - periodStart);
      const isPrivileged = this.isPrivilegedRole(role);
      const messageLimit = isPrivileged ? -1 : messageData.limits.period;
      const imageLimit = isPrivileged ? -1 : messageData.limits.imagePeriod;

      return {
        userId, role,
        usage: { current: messageData.messageUsage.current, total: messageData.messageUsage.total },
        imageUsage: { current: messageData.imageUsage.current, total: messageData.imageUsage.total },
        limits: { period: messageLimit, imagePeriod: imageLimit },
        remaining: {
          messages: messageLimit === -1 ? -1 : messageLimit - messageData.messageUsage.current,
          images: imageLimit === -1 ? -1 : imageLimit - messageData.imageUsage.current,
          days: Math.max(0, Math.ceil(timeRemaining / DAY_MS))
        },
        periodStart: messageData.periodStart,
        nextReset: periodStart + PERIOD_MS
      };
    } catch (error) {
      logger.error('quota_service', `Error while fetching statistics for ${userId}:`, error);
      throw error;
    }
  }

  async resetUserQuota(userId) {
    try {
      await QuotaDB.resetCurrentUsage(userId, Date.now());
      return true;
    } catch (error) {
      logger.error('quota_service', `Error while resetting quota for ${userId}:`, error);
      throw error;
    }
  }

  async syncQuotaForRole(userId, role) {
    try {
      const newLimit = this.roleLimits[role] ?? DEFAULT_MESSAGE_LIMIT;
      const newImageLimit = this.roleImageLimits[role] ?? DEFAULT_IMAGE_LIMIT;
      await this.initializeUserMessageData(userId);
      await QuotaDB.setQuotaLimit(userId, newLimit, newImageLimit, Date.now());
      logger.info('quota_service', `Synced quota for ${userId}: role=${role}, limit=${newLimit}, imageLimit=${newImageLimit}`);
      return true;
    } catch (error) {
      logger.error('quota_service', `Error while syncing quota for ${userId}:`, error);
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
      logger.error('quota_service', 'Error while fetching system statistics:', error);
      throw error;
    }
  }

  async initializeCollection() {
    try {
      await QuotaDB.initTables();
    } catch (error) {
      logger.error('quota_service', 'Error while initializing MariaDB user_quotas table:', error);
      throw error;
    }
  }
}

module.exports = new QuotaService();
