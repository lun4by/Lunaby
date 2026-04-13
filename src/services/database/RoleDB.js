const mariaClient = require('./mariaClient');
const logger = require('../../utils/core/logger');
const { ensureMariaTables } = require('./mariaSchemaValidator');

class RoleDB {
    async initTables() {
        try {
            await ensureMariaTables(['user_roles'], 'RoleDB');
            logger.info('mariadb', 'user_roles table validated');
            return true;
        } catch (error) {
            logger.error('mariadb', 'Error validating user_roles table:', error);
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
            logger.error('role_db', `Error getting user role for ${userId}:`, error);
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
            logger.error('role_db', `Error setting role for ${userId}:`, error);
            throw error;
        }
    }
}

module.exports = new RoleDB();
