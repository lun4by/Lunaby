const MariaBlacklistDB = require('../database/MariaBlacklistDB');
const logger = require('../../utils/core/logger');

class BlacklistService {
  async isUserBlacklisted(userId) {
    try {
      return await MariaBlacklistDB.isUserBlacklisted(userId);
    } catch (error) {
      logger.error('blacklist_service', `Error while checking user blacklist ${userId}:`, error);
      return null;
    }
  }

  async isGuildBlacklisted(guildId) {
    try {
      return await MariaBlacklistDB.isGuildBlacklisted(guildId);
    } catch (error) {
      logger.error('blacklist_service', `Error while checking guild blacklist ${guildId}:`, error);
      return null;
    }
  }

  async addUser(userId, reason = null, createdBy = null) {
    const success = await MariaBlacklistDB.addUserBlacklist(userId, reason, createdBy);
    if (!success) {
      throw new Error('Không thể thêm user vào blacklist.');
    }
    return true;
  }

  async removeUser(userId) {
    return MariaBlacklistDB.removeUserBlacklist(userId);
  }

  async addGuild(guildId, reason = null, createdBy = null) {
    const success = await MariaBlacklistDB.addGuildBlacklist(guildId, reason, createdBy);
    if (!success) {
      throw new Error('Không thể thêm server vào blacklist.');
    }
    return true;
  }

  async removeGuild(guildId) {
    return MariaBlacklistDB.removeGuildBlacklist(guildId);
  }

  async getUsers(limit = 100) {
    return MariaBlacklistDB.getUserBlacklist(limit);
  }

  async getGuilds(limit = 100) {
    return MariaBlacklistDB.getGuildBlacklist(limit);
  }
}

module.exports = new BlacklistService();