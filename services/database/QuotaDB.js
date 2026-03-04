const mariaClient = require('./mariaClient');
const logger = require('../../utils/logger');
const { DEFAULT_QUOTA_ROLES, PERIOD_MS } = require('../../config/constants');

class QuotaDB {
    async initTables() {
        try {
            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS user_quotas (
          user_id VARCHAR(32) PRIMARY KEY,
          current_usage INT DEFAULT 0,
          total_usage INT DEFAULT 0,
          limit_period INT DEFAULT 600,
          period_start BIGINT,
          created_at BIGINT,
          updated_at BIGINT,
          INDEX idx_total_usage (total_usage)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
            logger.info('MARIADB', 'user_quotas table ready');
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error creating user_quotas table:', error);
            return false;
        }
    }

    async getUserQuota(userId) {
        try {
            const rows = await mariaClient.query(
                'SELECT * FROM user_quotas WHERE user_id = ?',
                [userId]
            );
            if (rows.length === 0) return null;

            const row = rows[0];
            return {
                userId: row.user_id,
                messageUsage: { current: row.current_usage, total: row.total_usage },
                limits: { period: row.limit_period },
                periodStart: Number(row.period_start),
                createdAt: Number(row.created_at),
                updatedAt: Number(row.updated_at)
            };
        } catch (error) {
            logger.error('QUOTA_DB', `Error getting user quota for ${userId}:`, error);
            throw error;
        }
    }

    async createUserQuota(userId, limitPeriod, now) {
        try {
            await mariaClient.query(
                `INSERT IGNORE INTO user_quotas (user_id, current_usage, total_usage, limit_period, period_start, created_at, updated_at)
          VALUES (?, 0, 0, ?, ?, ?, ?)`,
                [userId, limitPeriod, now, now, now]
            );
            return await this.getUserQuota(userId);
        } catch (error) {
            logger.error('QUOTA_DB', `Error creating quota for ${userId}:`, error);
            throw error;
        }
    }

    async resetCurrentUsage(userId, now) {
        try {
            await mariaClient.query(
                'UPDATE user_quotas SET current_usage = 0, period_start = ?, updated_at = ? WHERE user_id = ?',
                [now, now, userId]
            );
            return true;
        } catch (error) {
            logger.error('QUOTA_DB', `Error resetting current usage for ${userId}:`, error);
            return false;
        }
    }

    async recordUsage(userId, amount, now) {
        try {
            await mariaClient.query(
                'UPDATE user_quotas SET current_usage = current_usage + ?, total_usage = total_usage + ?, updated_at = ? WHERE user_id = ?',
                [amount, amount, now, userId]
            );
            return true;
        } catch (error) {
            logger.error('QUOTA_DB', `Error recording usage for ${userId}:`, error);
            return false;
        }
    }

    async getAllUsers() {
        try {
            return await mariaClient.query('SELECT * FROM user_quotas');
        } catch (error) {
            logger.error('QUOTA_DB', 'Error getting all users:', error);
            throw error;
        }
    }
    async addQuotaLimit(userId, amount, now) {
        try {
            await mariaClient.query(
                'UPDATE user_quotas SET limit_period = GREATEST(0, limit_period + ?), updated_at = ? WHERE user_id = ? AND limit_period != -1',
                [amount, now, userId]
            );
            return true;
        } catch (error) {
            logger.error('QUOTA_DB', `Error adding quota for ${userId}:`, error);
            throw error;
        }
    }
}

module.exports = new QuotaDB();