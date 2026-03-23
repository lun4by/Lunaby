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
          current_image_usage INT DEFAULT 0,
          total_image_usage INT DEFAULT 0,
          image_limit_period INT DEFAULT 10,
          period_start BIGINT,
          created_at BIGINT,
          updated_at BIGINT,
          INDEX idx_total_usage (total_usage)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
            
            // Alter existing table to add new columns if they do not exist
            try {
                await mariaClient.query(`
                    ALTER TABLE user_quotas 
                    ADD COLUMN IF NOT EXISTS current_image_usage INT DEFAULT 0, 
                    ADD COLUMN IF NOT EXISTS total_image_usage INT DEFAULT 0, 
                    ADD COLUMN IF NOT EXISTS image_limit_period INT DEFAULT 10
                `);
            } catch(e) { /* Ignore error if columns already exist (some MariaDB versions don't support IF NOT EXISTS on ALTER) */ }
            
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
                imageUsage: { current: row.current_image_usage || 0, total: row.total_image_usage || 0 },
                limits: { period: row.limit_period, imagePeriod: row.image_limit_period !== undefined ? row.image_limit_period : 10 },
                periodStart: Number(row.period_start),
                createdAt: Number(row.created_at),
                updatedAt: Number(row.updated_at)
            };
        } catch (error) {
            logger.error('QUOTA_DB', `Error getting user quota for ${userId}:`, error);
            throw error;
        }
    }

    async createUserQuota(userId, limitPeriod, imageLimitPeriod, now) {
        try {
            await mariaClient.query(
                `INSERT IGNORE INTO user_quotas (user_id, current_usage, total_usage, limit_period, current_image_usage, total_image_usage, image_limit_period, period_start, created_at, updated_at)
          VALUES (?, 0, 0, ?, 0, 0, ?, ?, ?, ?)`,
                [userId, limitPeriod, imageLimitPeriod, now, now, now]
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
                'UPDATE user_quotas SET current_usage = 0, current_image_usage = 0, period_start = ?, updated_at = ? WHERE user_id = ?',
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

    async recordImageUsage(userId, amount, now) {
        try {
            await mariaClient.query(
                'UPDATE user_quotas SET current_image_usage = current_image_usage + ?, total_image_usage = total_image_usage + ?, updated_at = ? WHERE user_id = ?',
                [amount, amount, now, userId]
            );
            return true;
        } catch (error) {
            logger.error('QUOTA_DB', `Error recording image usage for ${userId}:`, error);
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

    async setQuotaLimit(userId, newLimit, newImageLimit, now) {
        try {
            await mariaClient.query(
                'UPDATE user_quotas SET limit_period = ?, image_limit_period = ?, updated_at = ? WHERE user_id = ?',
                [newLimit, newImageLimit, now, userId]
            );
            return true;
        } catch (error) {
            logger.error('QUOTA_DB', `Error setting quota limit for ${userId}:`, error);
            throw error;
        }
    }
}

module.exports = new QuotaDB();