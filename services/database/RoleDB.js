const mariaClient = require('./mariaClient');
const logger = require('../../utils/logger');

class RoleDB {
    async initTables() {
        try {
            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS user_roles (
          user_id VARCHAR(32) PRIMARY KEY,
          role ENUM('owner', 'admin', 'pro', 'user') DEFAULT 'user',
          created_at BIGINT,
          updated_at BIGINT,
          INDEX idx_role (role)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
            logger.info('MARIADB', 'user_roles table ready');
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error creating user_roles table:', error);
            return false;
        }
    }

    async getUserRole(userId) {
        try {
            const rows = await mariaClient.query(
                'SELECT role FROM user_roles WHERE user_id = ?',
                [userId]
            );
            if (rows.length === 0) return 'user';

            return rows[0].role;
        } catch (error) {
            logger.error('ROLE_DB', `Error getting user role for ${userId}:`, error);
            return 'user';
        }
    }

    async setUserRole(userId, role, now) {
        try {
            await mariaClient.query(
                `INSERT INTO user_roles (user_id, role, created_at, updated_at)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE role = ?, updated_at = ?`,
                [userId, role, now, now, role, now]
            );
            return true;
        } catch (error) {
            logger.error('ROLE_DB', `Error setting role for ${userId}:`, error);
            throw error;
        }
    }
}

module.exports = new RoleDB();