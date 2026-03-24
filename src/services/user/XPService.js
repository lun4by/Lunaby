const MariaModDB = require('../database/MariaModDB');
const logger = require('../../utils/logger');

const COOLDOWN_MS = 60000;

class XPService {
  constructor() {
    this.cooldowns = new Map();
  }

  isOnCooldown(userId) {
    return this.cooldowns.has(userId);
  }

  addCooldown(userId) {
    this.cooldowns.set(userId, Date.now());
    setTimeout(() => this.cooldowns.delete(userId), COOLDOWN_MS);
  }

  calculateLevelCap(level) {
    return 150 * (level * 2);
  }

  calculateTotalXPForLevel(level) {
    let total = 0;
    for (let i = 1; i < level; i++) total += 300 * i;
    return total;
  }

  calculateCurrentLevelXP(totalXP, level) {
    const previousLevelXP = this.calculateTotalXPForLevel(level);
    return totalXP - previousLevelXP;
  }

  calculateMaxLevelXP(level) {
    return 300 * level;
  }

  async addXP(message) {
    try {
      if (message.author.bot) return null;
      if (message.content.startsWith('!') || message.content.startsWith('/')) return null;
      if (this.isOnCooldown(message.author.id)) return null;

      const currentXP = await MariaModDB.getUserXP(message.guild.id, message.author.id);
      
      const xpGained = Math.floor(Math.random() * 10) + 15;
      const previousLevel = currentXP.level;
      const newXP = currentXP.xp + xpGained;

      const nextLevelXP = this.calculateTotalXPForLevel(previousLevel + 1);
      let leveledUp = false;
      let newLevel = previousLevel;
      
      if (newXP >= nextLevelXP) {
        newLevel++;
        leveledUp = true;
      }

      await MariaModDB.setUserXP(message.guild.id, message.author.id, newXP, newLevel);
      
      this.addCooldown(message.author.id);

      return { xpAdded: true, xpGained, totalXP: newXP, level: newLevel, leveledUp, previousLevel };
    } catch (error) {
      logger.error('XP', 'Lỗi khi thêm XP:', error);
      return null;
    }
  }

  async getUserXP(guildId, userId) {
    try {
      const serverXP = await MariaModDB.getUserXP(guildId, userId);

      const currentLevelXP = this.calculateCurrentLevelXP(serverXP.xp, serverXP.level);
      const maxLevelXP = this.calculateMaxLevelXP(serverXP.level);

      return {
        xp: serverXP.xp,
        level: serverXP.level,
        currentLevelXP, maxLevelXP,
        percentage: Math.round((currentLevelXP / maxLevelXP) * 100)
      };
    } catch (error) {
      logger.error('XP', 'Lỗi khi lấy thông tin XP:', error);
      return null;
    }
  }

  async getLeaderboard(guildId, limit = 10) {
    try {
      return await MariaModDB.getGuildLeaderboard(guildId, limit);
    } catch (error) {
      logger.error('XP', 'Lỗi khi lấy leaderboard:', error);
      return [];
    }
  }

  async getUserRank(guildId, userId) {
    try {
        return await MariaModDB.getUserRank(guildId, userId);
    } catch (error) {
      logger.error('XP', 'Lỗi khi lấy rank:', error);
      return 0;
    }
  }
}

module.exports = new XPService();