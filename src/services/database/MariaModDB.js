const mariaClient = require('./mariaClient');
const logger = require('../../utils/logger');
const { ROLE_LIMITS, ROLE_IMAGE_LIMITS, USER_ROLES } = require('../../config/constants');

const DEFAULT_QUOTA_ROLE = USER_ROLES.USER;
const DEFAULT_LIMIT_PERIOD = ROLE_LIMITS[DEFAULT_QUOTA_ROLE] ?? 0;
const DEFAULT_IMAGE_LIMIT_PERIOD = ROLE_IMAGE_LIMITS[DEFAULT_QUOTA_ROLE] ?? 0;

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
          language VARCHAR(10) DEFAULT 'vi',
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

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS user_levels (
          guild_id VARCHAR(32) NOT NULL,
          user_id VARCHAR(32) NOT NULL,
          xp INT DEFAULT 0,
          level INT DEFAULT 1,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (guild_id, user_id),
          INDEX idx_guild_xp (guild_id, xp DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS user_consents (
          user_id VARCHAR(32) PRIMARY KEY,
          consented BOOLEAN DEFAULT FALSE,
          version VARCHAR(10) DEFAULT '1.0',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          user_id VARCHAR(32) PRIMARY KEY,
          global_xp INT DEFAULT 0,
          global_level INT DEFAULT 1,
          bio TEXT,
          color VARCHAR(20),
          background VARCHAR(255),
          inventory JSON DEFAULT ('[]'),
          badges JSON DEFAULT ('[]'),
          social JSON DEFAULT ('{}'),
          cosmetics JSON DEFAULT ('{}'),
          extra_data JSON DEFAULT ('{}'),
          language VARCHAR(10) DEFAULT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS user_economy (
          user_id VARCHAR(32) PRIMARY KEY,
          wallet INT DEFAULT 0,
          bank INT DEFAULT 0,
          shards INT DEFAULT 0,
          streak_current INT DEFAULT 0,
          streak_alltime INT DEFAULT 0,
          streak_timestamp BIGINT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS lvoice_config (
          guild_id VARCHAR(32) PRIMARY KEY,
          creator_channel_id VARCHAR(32),
          category_id VARCHAR(32),
          default_name VARCHAR(100) DEFAULT '{user}',
          default_limit INT DEFAULT 0,
          default_bitrate INT DEFAULT 64000,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            await mariaClient.query(`
        CREATE TABLE IF NOT EXISTS lvoice_active (
          channel_id VARCHAR(32) PRIMARY KEY,
          guild_id VARCHAR(32) NOT NULL,
          owner_id VARCHAR(32) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_guild (guild_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

            logger.info('MARIADB', 'All tables ready');

            try {
                await mariaClient.query(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS voice_toggle_enabled BOOLEAN DEFAULT FALSE`);
                await mariaClient.query(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS level_up_channel VARCHAR(32) DEFAULT NULL`);
                await mariaClient.query(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS vote_log_channel VARCHAR(32) DEFAULT NULL`);
                await mariaClient.query(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'vi'`);
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
                channels: { suggest: r.suggest_channel, voteLog: r.vote_log_channel },
                settings: { levelUpNotifications: !!r.level_up_notifications, levelUpChannel: r.level_up_channel, useEmbeds: !!r.use_embeds },
                language: r.language || 'vi',
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
            channels: { suggest: null, voteLog: null },
            settings: { levelUpNotifications: true, levelUpChannel: null, useEmbeds: true },
            language: 'vi',
        };
    }

    async updateGuildSettings(guildId, updateData) {
        try {
            const fieldMap = {
                'prefix': 'prefix',
                'xp.isActive': 'xp_active',
                'xp.exceptions': 'xp_exceptions',
                'settings.levelUpNotifications': 'level_up_notifications',
                'settings.levelUpChannel': 'level_up_channel',
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
                'channels.voteLog': 'vote_log_channel',
                'language': 'language',
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

    async getUserXP(guildId, userId) {
        try {
            const rows = await mariaClient.query(
                'SELECT xp, level FROM user_levels WHERE guild_id = ? AND user_id = ?',
                [guildId, userId]
            );
            if (rows.length === 0) return { xp: 0, level: 1 };
            return { xp: rows[0].xp, level: rows[0].level };
        } catch (error) {
            logger.error('MARIADB', 'Error getting user XP:', error);
            return { xp: 0, level: 1 };
        }
    }

    async setUserXP(guildId, userId, xp, level) {
        try {
            await mariaClient.query(`
                INSERT INTO user_levels (guild_id, user_id, xp, level)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                xp = VALUES(xp),
                level = VALUES(level)
            `, [guildId, userId, xp, level]);
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error setting user XP:', error);
            return false;
        }
    }

    async getGuildLeaderboard(guildId, limit = 10) {
        try {
            const rows = await mariaClient.query(
                'SELECT user_id as userId, xp, level FROM user_levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ?',
                [guildId, limit]
            );
            return rows;
        } catch (error) {
            logger.error('MARIADB', 'Error getting guild leaderboard:', error);
            return [];
        }
    }

    async getUserRank(guildId, userId) {
        try {
            const rows = await mariaClient.query('SELECT xp FROM user_levels WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
            if (rows.length === 0) return 0;

            const countRows = await mariaClient.query(
                'SELECT COUNT(*) as count FROM user_levels WHERE guild_id = ? AND xp > ?',
                [guildId, rows[0].xp]
            );
            return Number(countRows[0].count) + 1;
        } catch (error) {
            logger.error('MARIADB', 'Error getting user rank:', error);
            return 0;
        }
    }

    async getUserProfile(userId) {
        try {
            const rows = await mariaClient.query('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
            if (rows.length === 0) {
                await mariaClient.query('INSERT IGNORE INTO user_profiles (user_id) VALUES (?)', [userId]);
                return { user_id: userId, global_xp: 0, global_level: 1, bio: null, color: null, background: null, inventory: null, badges: null, social: null, cosmetics: null, extra_data: null, language: null };
            }
            return rows[0];
        } catch (error) {
            logger.error('MARIADB', 'Error getting user profile:', error);
            return null;
        }
    }

    async updateUserProfile(userId, updateFields, updateValues) {
        try {
            let sets = [];
            for (const field of updateFields) {
                sets.push(`${field} = ?`);
            }
            if (!sets.length) return true;

            await mariaClient.query(`INSERT IGNORE INTO user_profiles (user_id) VALUES (?)`, [userId]);

            updateValues.push(userId);
            await mariaClient.query(
                `UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = ?`,
                updateValues
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error updating user profile:', error);
            return false;
        }
    }

    async getUserEconomy(userId) {
        try {
            const rows = await mariaClient.query('SELECT * FROM user_economy WHERE user_id = ?', [userId]);
            if (rows.length === 0) {
                await mariaClient.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [userId]);
                return { user_id: userId, wallet: 0, bank: 0, shards: 0, streak_current: 0, streak_alltime: 0, streak_timestamp: 0 };
            }
            return rows[0];
        } catch (error) {
            logger.error('MARIADB', 'Error getting user economy:', error);
            return null;
        }
    }

    async getUserCredits(userId) {
        try {
            const economy = await this.getUserEconomy(userId);
            return Number(economy?.wallet || 0);
        } catch (error) {
            logger.error('MARIADB', 'Error getting user credits:', error);
            return 0;
        }
    }

    async setUserCredits(userId, amount) {
        try {
            const safeAmount = Math.max(0, Math.trunc(Number(amount) || 0));
            await mariaClient.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [userId]);
            await mariaClient.query(
                'UPDATE user_economy SET wallet = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [safeAmount, userId]
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error setting user credits:', error);
            return false;
        }
    }

    async addUserCredits(userId, amount) {
        try {
            const changeAmount = Math.trunc(Number(amount) || 0);
            await mariaClient.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [userId]);
            await mariaClient.query(
                'UPDATE user_economy SET wallet = GREATEST(0, wallet + ?), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [changeAmount, userId]
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error adding user credits:', error);
            return false;
        }
    }

    async transferUserCredits(fromUserId, toUserId, amount) {
        let conn;
        try {
            const transferAmount = Math.trunc(Number(amount) || 0);
            if (transferAmount <= 0) {
                throw new Error('Số credits chuyển phải lớn hơn 0');
            }

            await mariaClient.connect();
            conn = await mariaClient.pool.getConnection();
            await conn.beginTransaction();

            await conn.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [fromUserId]);
            await conn.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [toUserId]);

            const senderRows = await conn.query(
                'SELECT wallet FROM user_economy WHERE user_id = ? FOR UPDATE',
                [fromUserId]
            );
            const receiverRows = await conn.query(
                'SELECT wallet FROM user_economy WHERE user_id = ? FOR UPDATE',
                [toUserId]
            );

            const senderBalance = Number(senderRows[0]?.wallet || 0);
            const receiverBalance = Number(receiverRows[0]?.wallet || 0);

            if (senderBalance < transferAmount) {
                throw new Error('Bạn không đủ credits để thực hiện giao dịch này.');
            }

            await conn.query(
                'UPDATE user_economy SET wallet = wallet - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [transferAmount, fromUserId]
            );
            await conn.query(
                'UPDATE user_economy SET wallet = wallet + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [transferAmount, toUserId]
            );

            await conn.commit();

            return {
                fromBalance: senderBalance - transferAmount,
                toBalance: receiverBalance + transferAmount
            };
        } catch (error) {
            if (conn) {
                try { await conn.rollback(); } catch { }
            }
            logger.error('MARIADB', 'Error transferring user credits:', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    async purchaseQuotaWithCredits(userId, usageType, quotaAmount, creditCost) {
        let conn;
        try {
            const normalizedType = String(usageType || '').toLowerCase();
            const normalizedQuota = Math.trunc(Number(quotaAmount) || 0);
            const normalizedCost = Math.trunc(Number(creditCost) || 0);

            if (!['chat', 'image'].includes(normalizedType)) {
                throw new Error('Loại quota không hợp lệ');
            }

            if (normalizedQuota <= 0 || normalizedCost <= 0) {
                throw new Error('Số quota hoặc credits không hợp lệ');
            }

            await mariaClient.connect();
            conn = await mariaClient.pool.getConnection();
            await conn.beginTransaction();

            await conn.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [userId]);
            const walletRows = await conn.query(
                'SELECT wallet FROM user_economy WHERE user_id = ? FOR UPDATE',
                [userId]
            );
            const currentCredits = Number(walletRows[0]?.wallet || 0);

            if (currentCredits < normalizedCost) {
                throw new Error('Bạn không đủ credits để mua thêm quota.');
            }

            await conn.query(
                `INSERT IGNORE INTO user_quotas (
                    user_id, current_usage, total_usage, limit_period,
                    current_image_usage, total_image_usage, image_limit_period,
                    period_start, created_at, updated_at
                ) VALUES (?, 0, 0, ${DEFAULT_LIMIT_PERIOD}, 0, 0, ${DEFAULT_IMAGE_LIMIT_PERIOD}, ?, ?, ?)`,
                [userId, Date.now(), Date.now(), Date.now()]
            );

            await conn.query(
                'UPDATE user_economy SET wallet = wallet - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [normalizedCost, userId]
            );
            const updateQuery = normalizedType === 'image'
                ? 'UPDATE user_quotas SET image_limit_period = image_limit_period + ?, updated_at = ? WHERE user_id = ? AND image_limit_period != -1'
                : 'UPDATE user_quotas SET limit_period = limit_period + ?, updated_at = ? WHERE user_id = ? AND limit_period != -1';

            await conn.query(updateQuery, [normalizedQuota, Date.now(), userId]);

            await conn.commit();
            return true;
        } catch (error) {
            if (conn) {
                try { await conn.rollback(); } catch { }
            }
            logger.error('MARIADB', 'Error purchasing quota with credits:', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    async updateUserEconomyCol(userId, colName, amount, isIncrement = false) {
        try {
            await mariaClient.query(`INSERT IGNORE INTO user_economy (user_id) VALUES (?)`, [userId]);
            let query = `UPDATE user_economy SET ${colName} = ? WHERE user_id = ?`;
            if (isIncrement) {
                query = `UPDATE user_economy SET ${colName} = ${colName} + ? WHERE user_id = ?`;
            }
            await mariaClient.query(query, [amount, userId]);
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error updating user economy:', error);
            return false;
        }
    }

    async resetAllUserProfileData() {
        try {
            const tables = [
                'user_profiles',
                'user_levels',
                'user_economy',
                'user_consents'
            ];

            const deleted = {};
            for (const table of tables) {
                const result = await mariaClient.query(`DELETE FROM ${table}`);
                deleted[table] = Number(result?.affectedRows || 0);
            }

            return {
                success: true,
                deleted,
                totalDeleted: Object.values(deleted).reduce((sum, count) => sum + count, 0)
            };
        } catch (error) {
            logger.error('MARIADB', 'Error resetting user profile data:', error);
            return {
                success: false,
                deleted: {},
                totalDeleted: 0
            };
        }
    }

    async getLVoiceConfig(guildId) {
        try {
            const rows = await mariaClient.query('SELECT * FROM lvoice_config WHERE guild_id = ?', [guildId]);
            if (rows.length === 0) return null;
            const r = rows[0];
            return {
                guildId: r.guild_id,
                creatorChannelId: r.creator_channel_id,
                categoryId: r.category_id,
                defaultName: r.default_name || '{user}',
                defaultLimit: r.default_limit || 0,
                defaultBitrate: r.default_bitrate || 64000,
            };
        } catch (error) {
            logger.error('MARIADB', 'Error getting LVoice config:', error);
            return null;
        }
    }

    async setLVoiceConfig(guildId, config) {
        try {
            const { creatorChannelId, categoryId, defaultName = '{user}', defaultLimit = 0, defaultBitrate = 64000 } = config;
            await mariaClient.query(`
                INSERT INTO lvoice_config (guild_id, creator_channel_id, category_id, default_name, default_limit, default_bitrate)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                creator_channel_id = VALUES(creator_channel_id),
                category_id = VALUES(category_id),
                default_name = VALUES(default_name),
                default_limit = VALUES(default_limit),
                default_bitrate = VALUES(default_bitrate)
            `, [guildId, creatorChannelId, categoryId, defaultName, defaultLimit, defaultBitrate]);
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error setting LVoice config:', error);
            return false;
        }
    }

    async deleteLVoiceConfig(guildId) {
        try {
            await mariaClient.query('DELETE FROM lvoice_config WHERE guild_id = ?', [guildId]);
            await mariaClient.query('DELETE FROM lvoice_active WHERE guild_id = ?', [guildId]);
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error deleting LVoice config:', error);
            return false;
        }
    }

    async addActiveVoice(channelId, guildId, ownerId) {
        try {
            await mariaClient.query(
                'INSERT IGNORE INTO lvoice_active (channel_id, guild_id, owner_id) VALUES (?, ?, ?)',
                [channelId, guildId, ownerId]
            );
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error adding active voice:', error);
            return false;
        }
    }

    async removeActiveVoice(channelId) {
        try {
            await mariaClient.query('DELETE FROM lvoice_active WHERE channel_id = ?', [channelId]);
            return true;
        } catch (error) {
            logger.error('MARIADB', 'Error removing active voice:', error);
            return false;
        }
    }

    async getActiveVoice(channelId) {
        try {
            const rows = await mariaClient.query('SELECT * FROM lvoice_active WHERE channel_id = ?', [channelId]);
            if (rows.length === 0) return null;
            const r = rows[0];
            return { channelId: r.channel_id, guildId: r.guild_id, ownerId: r.owner_id };
        } catch (error) {
            logger.error('MARIADB', 'Error getting active voice:', error);
            return null;
        }
    }

    async getAllActiveVoices() {
        try {
            const rows = await mariaClient.query('SELECT * FROM lvoice_active');
            return rows.map(r => ({ channelId: r.channel_id, guildId: r.guild_id, ownerId: r.owner_id }));
        } catch (error) {
            logger.error('MARIADB', 'Error getting all active voices:', error);
            return [];
        }
    }

    async getAllLVoiceConfigs() {
        try {
            const rows = await mariaClient.query('SELECT * FROM lvoice_config');
            return rows.map(r => ({
                guildId: r.guild_id,
                creatorChannelId: r.creator_channel_id,
                categoryId: r.category_id,
                defaultName: r.default_name || '{user}',
                defaultLimit: r.default_limit || 0,
                defaultBitrate: r.default_bitrate || 64000,
            }));
        } catch (error) {
            logger.error('MARIADB', 'Error getting all VoiceMaster configs:', error);
            return [];
        }
    }
}

module.exports = new MariaModDB();
