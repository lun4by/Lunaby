const ProfileDB = require('./database/profiledb');
const logger = require('../utils/logger');

class XPService {
  constructor() {
    this.cooldowns = new Map();
    this.cooldownTime = 60000; // 60 giây
  }

  isOnCooldown(userId) {
    return this.cooldowns.has(userId);
  }

  addCooldown(userId) {
    this.cooldowns.set(userId, Date.now());
    setTimeout(() => {
      this.cooldowns.delete(userId);
    }, this.cooldownTime);
  }

  calculateLevelCap(level) {
    return 150 * (level * 2);
  }

  calculateTotalXPForLevel(level) {
    let total = 0;
    for (let i = 1; i < level; i++) {
      total += this.calculateLevelCap(i);
    }
    return total;
  }

  calculateCurrentLevelXP(totalXP, level) {
    const previousLevelXP = this.calculateTotalXPForLevel(level);
    return totalXP - previousLevelXP;
  }

  calculateMaxLevelXP(level) {
    return this.calculateLevelCap(level);
  }

  async addXP(message) {
    try {
      if (message.author.bot) return null;
      if (message.content.startsWith('!') || message.content.startsWith('/')) return null;
      if (this.isOnCooldown(message.author.id)) return null;

      const profile = await ProfileDB.getProfile(message.author.id);

      let serverXP = profile.data.xp.find(x => x.id === message.guild.id);

      if (!serverXP) {
        serverXP = {
          id: message.guild.id,
          xp: 0,
          level: 1
        };
        profile.data.xp.push(serverXP);
      }

      const xpAdd = Math.floor(Math.random() * 10) + 15;
      const currentXP = serverXP.xp;
      const currentLevel = serverXP.level;

      serverXP.xp = currentXP + xpAdd;

      const nextLevelXP = this.calculateTotalXPForLevel(currentLevel + 1);

      let leveledUp = false;
      if (serverXP.xp >= nextLevelXP) {
        serverXP.level = currentLevel + 1;
        leveledUp = true;
      }

      const collection = await ProfileDB.getProfileCollection();
      await collection.updateOne(
        { _id: message.author.id },
        { $set: { 'data.xp': profile.data.xp } }
      );

      this.addCooldown(message.author.id);

      logger.debug('XP', `${message.author.tag} +${xpAdd} XP (Level ${serverXP.level})`);

      return {
        xpAdded: true,
        xpGained: xpAdd,
        totalXP: serverXP.xp,
        level: serverXP.level,
        leveledUp: leveledUp,
        previousLevel: currentLevel
      };
    } catch (error) {
      logger.error('XP', 'Lỗi khi thêm XP:', error);
      return null;
    }
  }

  async getUserXP(guildId, userId) {
    try {
      const profile = await ProfileDB.getProfile(userId);
      let serverXP = profile.data.xp.find(x => x.id === guildId);

      if (!serverXP) {
        serverXP = {
          id: guildId,
          xp: 0,
          level: 1
        };
      }

      const currentLevelXP = this.calculateCurrentLevelXP(serverXP.xp, serverXP.level);
      const maxLevelXP = this.calculateMaxLevelXP(serverXP.level);
      const percentage = Math.round((currentLevelXP / maxLevelXP) * 100);

      return {
        xp: serverXP.xp,
        level: serverXP.level,
        currentLevelXP: currentLevelXP,
        maxLevelXP: maxLevelXP,
        percentage: percentage
      };
    } catch (error) {
      logger.error('XP', 'Lỗi khi lấy thông tin XP:', error);
      return null;
    }
  }

  async getLeaderboard(guildId, limit = 10) {
    try {
      const collection = await ProfileDB.getProfileCollection();
      const profiles = await collection.find({
        'data.xp': { $elemMatch: { id: guildId } }
      }).toArray();

      const leaderboard = profiles
        .map(profile => {
          const serverXP = profile.data.xp.find(x => x.id === guildId);
          return {
            userId: profile._id,
            xp: serverXP.xp,
            level: serverXP.level
          };
        })
        .sort((a, b) => b.xp - a.xp)
        .slice(0, limit);

      return leaderboard;
    } catch (error) {
      logger.error('XP', 'Lỗi khi lấy leaderboard:', error);
      return [];
    }
  }

  async getUserRank(guildId, userId) {
    try {
      const collection = await ProfileDB.getProfileCollection();
      const profiles = await collection.find({
        'data.xp': { $elemMatch: { id: guildId } }
      }).toArray();

      const sorted = profiles
        .map(profile => {
          const serverXP = profile.data.xp.find(x => x.id === guildId);
          return {
            userId: profile._id,
            xp: serverXP ? serverXP.xp : 0
          };
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
