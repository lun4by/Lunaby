const mariaClient = require('./mariaClient');
const logger = require('../../utils/logger');

class MariaModDB {
    async initTables() {
        try {
            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS mod_settings (
          guild_id VARCHAR(32) PRIMARY KEY,
          log_channel_id VARCHAR(32),
          mod_action_logs BOOLEAN DEFAULT TRUE,
          monitor_logs BOOLEAN DEFAULT TRUE,
          updated_by VARCHAR(32),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS mod_warnings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          guild_id VARCHAR(32) NOT NULL,
          user_id VARCHAR(32) NOT NULL,
          moderator_id VARCHAR(32) NOT NULL,
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_guild (guild_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS mod_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          guild_id VARCHAR(32) NOT NULL,
          target_id VARCHAR(32),
          moderator_id VARCHAR(32),
          action VARCHAR(50) NOT NULL,
          reason TEXT,
          duration INT DEFAULT NULL,
          count INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_guild_target (guild_id, target_id),
          INDEX idx_guild_action (guild_id, action)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            logger.info('MARIADB', 'Moderation tables ready');
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error creating moderation tables:', error);
            return false;
        }
    }

    async getSettings(guildId) {
        try {
            const rows = await mariaClient.query(
                'SELECT * FROM mod_settings WHERE guild_id = ?',
                [guildId]
            );
            if (rows.length === 0) return null;

            const row = rows[0];
            return {
                guildId: row.guild_id,
                logChannelId: row.log_channel_id,
                modActionLogs: !!row.mod_action_logs,
                monitorLogs: !!row.monitor_logs,
                updatedBy: row.updated_by,
                updatedAt: row.updated_at
            };
        } catch (error) {
            logger.error('MARIADB', 'Error getting mod settings:', error);
            return null;
        }
    }

    async setSettings(guildId, settings) {
        try {
            const { logChannelId, modActionLogs = true, monitorLogs = true, updatedBy } = settings;
            await mariaClient.query(
                `INSERT INTO mod_settings (guild_id, log_channel_id, mod_action_logs, monitor_logs, updated_by) 
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         log_channel_id = VALUES(log_channel_id),
         mod_action_logs = VALUES(mod_action_logs),
         monitor_logs = VALUES(monitor_logs),
         updated_by = VALUES(updated_by)`,
                [guildId, logChannelId, modActionLogs, monitorLogs, updatedBy]
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error setting mod settings:', error);
            return false;
        }
    }

    async addWarning(guildId, userId, moderatorId, reason) {
        try {
            await mariaClient.query(
                'INSERT INTO mod_warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)',
                [guildId, userId, moderatorId, reason]
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error adding warning:', error);
            return false;
        }
    }

    async getWarnings(guildId, userId) {
        try {
            const rows = await mariaClient.query(
                'SELECT id, moderator_id as moderatorId, reason, created_at as timestamp FROM mod_warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC',
                [guildId, userId]
            );
            return rows;
        } catch (error) {
            logger.error('MARIADB', 'Error getting warnings:', error);
            return [];
        }
    }

    async getWarningCount(guildId, userId) {
        try {
            const [row] = await mariaClient.query(
                'SELECT COUNT(*) as count FROM mod_warnings WHERE guild_id = ? AND user_id = ?',
                [guildId, userId]
            );
            return row ? Number(row.count) : 0;
        } catch (error) {
            logger.error('MARIADB', 'Error getting warning count:', error);
            return 0;
        }
    }

    async clearAllWarnings(guildId, userId) {
        try {
            const result = await mariaClient.query(
                'DELETE FROM mod_warnings WHERE guild_id = ? AND user_id = ?',
                [guildId, userId]
            );
            return result.affectedRows;
        } catch (error) {
            logger.error('MARIADB', 'Error clearing warnings:', error);
            return 0;
        }
    }

    async clearLatestWarning(guildId, userId) {
        try {
            const rows = await mariaClient.query(
                'SELECT id FROM mod_warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
                [guildId, userId]
            );

            if (rows.length === 0) return 0;

            const latestId = rows[0].id;

            const result = await mariaClient.query(
                'DELETE FROM mod_warnings WHERE id = ?',
                [latestId]
            );
            return result.affectedRows;
        } catch (error) {
            logger.error('MARIADB', 'Error clearing latest warning:', error);
            return 0;
        }
    }

    async addModLog(guildId, targetId, moderatorId, action, extra = {}) {
        try {
            const { reason = null, duration = null, count = null } = extra;
            await mariaClient.query(
                'INSERT INTO mod_logs (guild_id, target_id, moderator_id, action, reason, duration, count) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [guildId, targetId, moderatorId, action, reason, duration, count]
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error adding mod log:', error);
            return false;
        }
    }

    async getModLogs({ guildId, targetId, action, limit = 10 }) {
        try {
            let query = 'SELECT id, target_id as targetId, moderator_id as moderatorId, action, reason, duration, count, created_at as timestamp FROM mod_logs WHERE guild_id = ?';
            const params = [guildId];

            if (targetId) {
                query += ' AND target_id = ?';
                params.push(targetId);
            }

            if (action) {
                query += ' AND action = ?';
                params.push(action);
            }

            query += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);

            const rows = await mariaClient.query(query, params);
            return rows;
        } catch (error) {
            logger.error('MARIADB', 'Error getting mod logs:', error);
            return [];
        }
    }
}

module.exports = new MariaModDB();
