const mariaClient = require('./mariaClient');
const logger = require('../../utils/logger');
const { DEFAULT_PREFIX } = require('../../config/constants');

class PrefixDB {
    constructor() {
        // In-memory cache to avoid DB queries on every message
        this.userCache = new Map();
        this.serverCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    async initTables() {
        try {
            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS user_prefixes (
          user_id VARCHAR(32) PRIMARY KEY,
          prefix VARCHAR(10) NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS server_prefixes (
          guild_id VARCHAR(32) PRIMARY KEY,
          prefix VARCHAR(10) NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            logger.info('MARIADB', 'Prefix tables ready');
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error creating prefix tables:', error);
            return false;
        }
    }

    async getUserPrefix(userId) {
        // Check cache
        const cached = this.userCache.get(userId);
        if (cached && Date.now() - cached.time < this.cacheExpiry) {
            return cached.prefix;
        }

        try {
            const rows = await mariaClient.query(
                'SELECT prefix FROM user_prefixes WHERE user_id = ?',
                [userId]
            );
            const prefix = rows.length > 0 ? rows[0].prefix : null;
            if (prefix) this.userCache.set(userId, { prefix, time: Date.now() });
            return prefix;
        } catch (error) {
            logger.error('MARIADB', 'Error getting user prefix:', error);
            return null;
        }
    }

    async setUserPrefix(userId, prefix) {
        try {
            await mariaClient.query(
                'INSERT INTO user_prefixes (user_id, prefix) VALUES (?, ?) ON DUPLICATE KEY UPDATE prefix = ?',
                [userId, prefix, prefix]
            );
            this.userCache.set(userId, { prefix, time: Date.now() });
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error setting user prefix:', error);
            return false;
        }
    }

    async removeUserPrefix(userId) {
        try {
            await mariaClient.query(
                'DELETE FROM user_prefixes WHERE user_id = ?',
                [userId]
            );
            this.userCache.delete(userId);
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error removing user prefix:', error);
            return false;
        }
    }

    async getServerPrefix(guildId) {
        const cached = this.serverCache.get(guildId);
        if (cached && Date.now() - cached.time < this.cacheExpiry) {
            return cached.prefix;
        }

        try {
            const rows = await mariaClient.query(
                'SELECT prefix FROM server_prefixes WHERE guild_id = ?',
                [guildId]
            );
            const prefix = rows.length > 0 ? rows[0].prefix : null;
            if (prefix) this.serverCache.set(guildId, { prefix, time: Date.now() });
            return prefix;
        } catch (error) {
            logger.error('MARIADB', 'Error getting server prefix:', error);
            return null;
        }
    }

    async setServerPrefix(guildId, prefix) {
        try {
            await mariaClient.query(
                'INSERT INTO server_prefixes (guild_id, prefix) VALUES (?, ?) ON DUPLICATE KEY UPDATE prefix = ?',
                [guildId, prefix, prefix]
            );
            this.serverCache.set(guildId, { prefix, time: Date.now() });
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error setting server prefix:', error);
            return false;
        }
    }

    async removeServerPrefix(guildId) {
        try {
            await mariaClient.query(
                'DELETE FROM server_prefixes WHERE guild_id = ?',
                [guildId]
            );
            this.serverCache.delete(guildId);
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error removing server prefix:', error);
            return false;
        }
    }

    /**
     * Resolve prefix for a message context.
     * Priority: user prefix > server prefix > default
     */
    async resolvePrefix(userId, guildId) {
        const userPrefix = await this.getUserPrefix(userId);
        if (userPrefix) return userPrefix;

        if (guildId) {
            const serverPrefix = await this.getServerPrefix(guildId);
            if (serverPrefix) return serverPrefix;
        }

        return DEFAULT_PREFIX;
    }
}

module.exports = new PrefixDB();
