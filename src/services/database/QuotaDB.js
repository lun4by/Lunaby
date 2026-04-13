const mariaClient = require('./mariaClient');
const logger = require('../../utils/core/logger');
const { ROLE_LIMITS, ROLE_IMAGE_LIMITS, USER_ROLES } = require('../../config/constants');
const { ensureMariaTables } = require('./mariaSchemaValidator');

const DEFAULT_QUOTA_ROLE = USER_ROLES.USER;
const DEFAULT_LIMIT_PERIOD = ROLE_LIMITS[DEFAULT_QUOTA_ROLE] ?? 0;
const DEFAULT_IMAGE_LIMIT_PERIOD = ROLE_IMAGE_LIMITS[DEFAULT_QUOTA_ROLE] ?? 0;

class QuotaDB {
    async initTables() {
        try {
            await ensureMariaTables(['user_quotas'], 'QuotaDB');
            logger.info('mariadb', 'user_quotas table validated');
            return true;
        } catch (error) {
            logger.error('mariadb', 'Error validating user_quotas table:', error);
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
                limits: {
                    period: row.limit_period !== undefined ? row.limit_period : DEFAULT_LIMIT_PERIOD,
                    imagePeriod: row.image_limit_period !== undefined ? row.image_limit_period : DEFAULT_IMAGE_LIMIT_PERIOD
                },
                periodStart: Number(row.period_start),
                createdAt: Number(row.created_at),
                updatedAt: Number(row.updated_at)
            };
        } catch (error) {
            logger.error('quota_db', `Error getting user quota for ${userId}:`, error);
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
            logger.error('quota_db', `Error creating quota for ${userId}:`, error);
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
            logger.error('quota_db', `Error resetting current usage for ${userId}:`, error);
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
            logger.error('quota_db', `Error recording usage for ${userId}:`, error);
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
            logger.error('quota_db', `Error recording image usage for ${userId}:`, error);
            return false;
        }
    }

    async getAllUsers() {
        try {
            return await mariaClient.query('SELECT * FROM user_quotas');
        } catch (error) {
            logger.error('quota_db', 'Error getting all users:', error);
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
            logger.error('quota_db', `Error adding quota for ${userId}:`, error);
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
            logger.error('quota_db', `Error setting quota limit for ${userId}:`, error);
            throw error;
        }
    }
}

module.exports = new QuotaDB();

