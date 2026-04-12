const MariaModDB = require('../database/MariaModDB');
const logger = require('../../utils/core/logger');
const Validators = require('../../utils/text/validators');

class CreditsService {
  async getUserCredits(userId) {
    try {
      Validators.validateUserIdOrThrow(userId, 'getUserCredits');

      const credits = await MariaModDB.getUserCredits(userId);

      return {
        userId,
        credits
      };
    } catch (error) {
      logger.error('credits_service', `Error while fetching credits for ${userId}:`, error);
      throw error;
    }
  }

  async addCredits(userId, amount) {
    try {
      Validators.validateUserIdOrThrow(userId, 'addCredits');

      const normalizedAmount = Math.trunc(Number(amount));
      if (!Number.isFinite(normalizedAmount)) {
        throw new Error(`Số credits không hợp lệ: ${amount}`);
      }

      const success = await MariaModDB.addUserCredits(userId, normalizedAmount);
      if (!success) {
        throw new Error(`Không thể cộng credits cho ${userId}`);
      }

      return this.getUserCredits(userId);
    } catch (error) {
      logger.error('credits_service', `Error while adding credits for ${userId}:`, error);
      throw error;
    }
  }

  async setCredits(userId, amount) {
    try {
      Validators.validateUserIdOrThrow(userId, 'setCredits');

      const normalizedAmount = Math.trunc(Number(amount));
      if (!Number.isFinite(normalizedAmount)) {
        throw new Error(`Số credits không hợp lệ: ${amount}`);
      }

      const success = await MariaModDB.setUserCredits(userId, normalizedAmount);
      if (!success) {
        throw new Error(`Không thể đặt credits cho ${userId}`);
      }

      return this.getUserCredits(userId);
    } catch (error) {
      logger.error('credits_service', `Error while setting credits for ${userId}:`, error);
      throw error;
    }
  }

  async transferCredits(fromUserId, toUserId, amount) {
    try {
      Validators.validateUserIdOrThrow(fromUserId, 'transferCredits');
      Validators.validateUserIdOrThrow(toUserId, 'transferCredits');

      if (fromUserId === toUserId) {
        throw new Error('Bạn không thể tự chuyển credits cho chính mình.');
      }

      const normalizedAmount = Math.trunc(Number(amount));
      if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        throw new Error(`Số credits không hợp lệ: ${amount}`);
      }

      return await MariaModDB.transferUserCredits(fromUserId, toUserId, normalizedAmount);
    } catch (error) {
      logger.error('credits_service', `Error while transferring credits from ${fromUserId} to ${toUserId}:`, error);
      throw error;
    }
  }

  async purchaseQuotaWithCredits(userId, usageType, quotaAmount, creditCost) {
    try {
      Validators.validateUserIdOrThrow(userId, 'purchaseQuotaWithCredits');
      const normalizedType = String(usageType || '').toLowerCase();

      const normalizedQuota = Math.trunc(Number(quotaAmount));
      const normalizedCost = Math.trunc(Number(creditCost));

      if (!['chat', 'image'].includes(normalizedType)) {
        throw new Error(`Loại quota không hợp lệ: ${usageType}`);
      }

      if (!Number.isFinite(normalizedQuota) || normalizedQuota <= 0) {
        throw new Error(`Số quota không hợp lệ: ${quotaAmount}`);
      }

      if (!Number.isFinite(normalizedCost) || normalizedCost <= 0) {
        throw new Error(`Số credits không hợp lệ: ${creditCost}`);
      }

      return await MariaModDB.purchaseQuotaWithCredits(userId, normalizedType, normalizedQuota, normalizedCost);
    } catch (error) {
      logger.error('credits_service', `Error while purchasing quota with credits for ${userId}:`, error);
      throw error;
    }
  }
}

module.exports = new CreditsService();

