const ProfileDB = require('./database/profiledb');
const logger = require('../utils/logger');

const COOLDOWN_MS = 60000;
const DEFAULT_SERVER_XP = (guildId) => ({ id: guildId, xp: 0, level: 1 });

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

      const profile = await ProfileDB.getProfile(message.author.id);
      let serverXP = profile.data.xp.find(x => x.id === message.guild.id);

      if (!serverXP) {
        serverXP = DEFAULT_SERVER_XP(message.guild.id);
        profile.data.xp.push(serverXP);
      }

      const xpGained = Math.floor(Math.random() * 10) + 15;
      const previousLevel = serverXP.level;
      serverXP.xp += xpGained;

      const nextLevelXP = this.calculateTotalXPForLevel(previousLevel + 1);
      let leveledUp = false;
      if (serverXP.xp >= nextLevelXP) {
        serverXP.level++;
        leveledUp = true;
      }

      const collection = await ProfileDB.getProfileCollection();
      await collection.updateOne(
        { _id: message.author.id },
        { $set: { 'data.xp': profile.data.xp } }
      );

      this.addCooldown(message.author.id);

      return { xpAdded: true, xpGained, totalXP: serverXP.xp, level: serverXP.level, leveledUp, previousLevel };
    } catch (error) {
      logger.error('XP', 'Lỗi khi thêm XP:', error);
      return null;
    }
  }

  async getUserXP(guildId, userId) {
    try {
      const profile = await ProfileDB.getProfile(userId);
      const serverXP = profile.data.xp.find(x => x.id === guildId) || DEFAULT_SERVER_XP(guildId);

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

  async _getGuildProfiles(guildId) {
    const collection = await ProfileDB.getProfileCollection();
    return collection.find({ 'data.xp': { $elemMatch: { id: guildId } } }).toArray();
  }

  async getLeaderboard(guildId, limit = 10) {
    try {
      const profiles = await this._getGuildProfiles(guildId);
      return profiles
        .map(p => {
          const xp = p.data.xp.find(x => x.id === guildId);
          return { userId: p._id, xp: xp.xp, level: xp.level };
        })
        .sort((a, b) => b.xp - a.xp)
        .slice(0, limit);
    } catch (error) {
      logger.error('XP', 'Lỗi khi lấy leaderboard:', error);
      return [];
    }
  }

  async getUserRank(guildId, userId) {
    try {
      const profiles = await this._getGuildProfiles(guildId);
      const sorted = profiles
        .map(p => {
          const xp = p.data.xp.find(x => x.id === guildId);
          return { userId: p._id, xp: xp?.xp || 0 };
        })
        .sort((a, b) => b.xp - a.xp);

      const rank = sorted.findIndex(u => u.userId === userId) + 1;
      return rank || sorted.length + 1;
    } catch (error) {
      logger.error('XP', 'Lỗi khi lấy rank:', error);
      return 0;
    }
  }
}

module.exports = new XPService();