const MariaModDB = require('../database/MariaModDB');
const logger = require('../../utils/logger');
const Validators = require('../../utils/validators');

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
      logger.error('CREDITS_SERVICE', `Lỗi khi lấy credits cho ${userId}:`, error);
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
      logger.error('CREDITS_SERVICE', `Lỗi khi cộng credits cho ${userId}:`, error);
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
      logger.error('CREDITS_SERVICE', `Lỗi khi đặt credits cho ${userId}:`, error);
      throw error;
    }
  }
}

module.exports = new CreditsService();