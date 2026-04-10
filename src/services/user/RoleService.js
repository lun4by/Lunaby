const RoleDB = require('../database/RoleDB.js');
const logger = require('../../utils/logger.js');
const { USER_ROLES } = require('../../config/constants.js');

const VALID_ROLES = Object.values(USER_ROLES);

class RoleService {
    constructor() {
        this.ownerId = process.env.OWNER_ID?.trim() || null;
    }

    async initializeCollection() {
        try {
            await RoleDB.initTables();
        } catch (error) {
            logger.error('role_service', 'Error while initializing MariaDB user_roles table:', error);
            throw error;
        }
    }

    async getUserRole(userId) {
        try {
            if (this.ownerId && userId === this.ownerId) return 'owner';

            return await RoleDB.getUserRole(userId);
        } catch (error) {
            logger.error('role_service', `Error while fetching role for ${userId}:`, error);
            return 'user';
        }
    }

    async setUserRole(userId, role) {
        try {
            if (!VALID_ROLES.includes(role)) {
                throw new Error(`Vai trò không hợp lệ: ${role}. Các vai trò hợp lệ: ${VALID_ROLES.join(', ')}`);
            }

            const now = Date.now();
            await RoleDB.setUserRole(userId, role, now);
            const QuotaService = require('./QuotaService.js');
            await QuotaService.syncQuotaForRole(userId, role);

            return true;
        } catch (error) {
            logger.error('role_service', `Error while setting role for ${userId}:`, error);
            throw error;
        }
    }
}

module.exports = new RoleService();