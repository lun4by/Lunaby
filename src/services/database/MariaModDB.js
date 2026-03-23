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

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS guild_settings (
          guild_id VARCHAR(32) PRIMARY KEY,
          prefix VARCHAR(10) DEFAULT NULL,
          xp_active BOOLEAN DEFAULT FALSE,
          xp_exceptions JSON DEFAULT ('[]'),
          welcome_enabled BOOLEAN DEFAULT FALSE,
          welcome_channel VARCHAR(32),
          welcome_message TEXT,
          leaving_enabled BOOLEAN DEFAULT FALSE,
          leaving_channel VARCHAR(32),
          leaving_message TEXT,
          muted_role VARCHAR(32),
          suggest_channel VARCHAR(32),
          level_up_notifications BOOLEAN DEFAULT TRUE,
          use_embeds BOOLEAN DEFAULT TRUE,
          voice_toggle_enabled BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS command_toggles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          guild_id VARCHAR(32) NOT NULL,
          channel_id VARCHAR(32) NOT NULL,
          command_name VARCHAR(50) NOT NULL,
          updated_by VARCHAR(32),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_guild_channel_cmd (guild_id, channel_id, command_name),
          INDEX idx_guild_channel (guild_id, channel_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS bot_settings (
          setting_key VARCHAR(50) PRIMARY KEY,
          setting_value VARCHAR(255),
          updated_by VARCHAR(32),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            logger.info('MARIADB', 'All tables ready');

            try {
                await mariaClient.query(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS voice_toggle_enabled BOOLEAN DEFAULT FALSE`);
            } catch (e) {
            }

            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error creating tables:', error);
            return false;
        }
    }

    async getBotSetting(key) {
        try {
            const rows = await mariaClient.query(
                'SELECT setting_value FROM bot_settings WHERE setting_key = ?',
                [key]
            );
            return rows.length > 0 ? rows[0].setting_value : null;
        } catch (error) {
            logger.error('MARIADB', `Error getting bot setting ${key}:`, error);
            return null;
        }
    }

    async setBotSetting(key, value, updatedBy) {
        try {
            await mariaClient.query(`
                INSERT INTO bot_settings (setting_key, setting_value, updated_by)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                updated_by = VALUES(updated_by)
            `, [key, value, updatedBy]);
            return true;
        } catch (error) {
            logger.error('MARIADB', `Error setting bot setting ${key}:`, error);
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

    async getGuildSettings(guildId) {
        try {
            const rows = await mariaClient.query('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
            if (rows.length === 0) {
                await mariaClient.query('INSERT IGNORE INTO guild_settings (guild_id) VALUES (?)', [guildId]);
                return this._defaultGuildSettings(guildId);
            }
            const r = rows[0];

            let exceptions = [];
            try {
                if (typeof r.xp_exceptions === 'string' && r.xp_exceptions.trim() !== '') {
                    exceptions = JSON.parse(r.xp_exceptions);
                } else if (Array.isArray(r.xp_exceptions)) {
                    exceptions = r.xp_exceptions;
                }
            } catch (e) {
                // Ignore parsing errors and default to empty array
            }

            return {
                _id: r.guild_id,
                prefix: r.prefix,
                xp: { isActive: !!r.xp_active, exceptions },
                greeter: {
                    welcome: { isEnabled: !!r.welcome_enabled, channel: r.welcome_channel, message: r.welcome_message },
                    leaving: { isEnabled: !!r.leaving_enabled, channel: r.leaving_channel, message: r.leaving_message },
                },
                voiceToggle: { isEnabled: !!r.voice_toggle_enabled },
                roles: { muted: r.muted_role },
                channels: { suggest: r.suggest_channel },
                settings: { levelUpNotifications: !!r.level_up_notifications, useEmbeds: !!r.use_embeds },
            };
        } catch (error) {
            logger.error('MARIADB', 'Error getting guild settings:', error);
            return this._defaultGuildSettings(guildId);
        }
    }

    _defaultGuildSettings(guildId) {
        return {
            _id: guildId,
            prefix: null,
            xp: { isActive: false, exceptions: [] },
            greeter: {
                welcome: { isEnabled: false, channel: null, message: null },
                leaving: { isEnabled: false, channel: null, message: null },
            },
            voiceToggle: { isEnabled: false },
            roles: { muted: null },
            channels: { suggest: null },
            settings: { levelUpNotifications: true, useEmbeds: true },
        };
    }

    async updateGuildSettings(guildId, updateData) {
        try {
            const fieldMap = {
                'prefix': 'prefix',
                'xp.isActive': 'xp_active',
                'xp.exceptions': 'xp_exceptions',
                'settings.levelUpNotifications': 'level_up_notifications',
                'settings.useEmbeds': 'use_embeds',
                'greeter.welcome.isEnabled': 'welcome_enabled',
                'greeter.welcome.channel': 'welcome_channel',
                'greeter.welcome.message': 'welcome_message',
                'greeter.leaving.isEnabled': 'leaving_enabled',
                'greeter.leaving.channel': 'leaving_channel',
                'greeter.leaving.message': 'leaving_message',
                'voiceToggle.isEnabled': 'voice_toggle_enabled',
                'roles.muted': 'muted_role',
                'channels.suggest': 'suggest_channel',
            };

            const sets = [];
            const values = [];

            for (const [key, val] of Object.entries(updateData)) {
                const col = fieldMap[key];
                if (col) {
                    sets.push(`${col} = ?`);
                    values.push(col === 'xp_exceptions' ? JSON.stringify(val) : val);
                }
            }

            if (!sets.length) return true;

            values.push(guildId);
            await mariaClient.query(
                `INSERT INTO guild_settings (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id`,
                [guildId]
            );
            await mariaClient.query(
                `UPDATE guild_settings SET ${sets.join(', ')} WHERE guild_id = ?`,
                values
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', `Error updating guild settings for ${guildId}:`, error);
            return false;
        }
    }

    async toggleXp(guildId, isActive) {
        return this.updateGuildSettings(guildId, { 'xp.isActive': isActive });
    }

    async setXpException(guildId, channelId, isException) {
        try {
            const settings = await this.getGuildSettings(guildId);
            const exceptions = settings.xp?.exceptions || [];
            const has = exceptions.includes(channelId);

            if (isException && !has) exceptions.push(channelId);
            else if (!isException && has) exceptions.splice(exceptions.indexOf(channelId), 1);
            else return true;

            return this.updateGuildSettings(guildId, { 'xp.exceptions': exceptions });
        } catch (error) {
            logger.error('MARIADB', `Error setting XP exception for ${guildId}:`, error);
            return false;
        }
    }

    async disableCommand(guildId, channelId, commandName, userId) {
        try {
            await mariaClient.query(
                `INSERT IGNORE INTO command_toggles (guild_id, channel_id, command_name, updated_by) VALUES (?, ?, ?, ?)`,
                [guildId, channelId, commandName, userId]
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error disabling command:', error);
            return false;
        }
    }

    async enableCommand(guildId, channelId, commandName) {
        try {
            await mariaClient.query(
                'DELETE FROM command_toggles WHERE guild_id = ? AND channel_id = ? AND command_name = ?',
                [guildId, channelId, commandName]
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error enabling command:', error);
            return false;
        }
    }

    async disableAllCommands(guildId, channelId, commandNames, userId) {
        try {
            const values = commandNames.map(name => [guildId, channelId, name, userId]);
            const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
            await mariaClient.query(
                `INSERT IGNORE INTO command_toggles (guild_id, channel_id, command_name, updated_by) VALUES ${placeholders}`,
                values.flat()
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error disabling all commands:', error);
            return false;
        }
    }

    async enableAllCommands(guildId, channelId) {
        try {
            await mariaClient.query(
                'DELETE FROM command_toggles WHERE guild_id = ? AND channel_id = ?',
                [guildId, channelId]
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error enabling all commands:', error);
            return false;
        }
    }

    async getDisabledCommands(guildId, channelId) {
        try {
            const rows = await mariaClient.query(
                'SELECT command_name FROM command_toggles WHERE guild_id = ? AND channel_id = ?',
                [guildId, channelId]
            );
            return rows.map(r => r.command_name);
        } catch (error) {
            logger.error('MARIADB', 'Error getting disabled commands:', error);
            return [];
        }
    }

    async isCommandDisabled(guildId, channelId, commandName) {
        try {
            const rows = await mariaClient.query(
                'SELECT 1 FROM command_toggles WHERE guild_id = ? AND channel_id = ? AND command_name = ? LIMIT 1',
                [guildId, channelId, commandName]
            );
            return rows.length > 0;
        } catch (error) {
            logger.error('MARIADB', 'Error checking command status:', error);
            return false;
        }
    }
}

module.exports = new MariaModDB();