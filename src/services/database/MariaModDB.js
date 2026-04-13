const mariaClient = require('./mariaClient');
const logger = require('../../utils/core/logger');
const { ROLE_LIMITS, ROLE_IMAGE_LIMITS, USER_ROLES } = require('../../config/constants');
const { ensureMariaTables } = require('./mariaSchemaValidator');

const DEFAULT_QUOTA_ROLE = USER_ROLES.USER;
const DEFAULT_LIMIT_PERIOD = ROLE_LIMITS[DEFAULT_QUOTA_ROLE] ?? 0;
const DEFAULT_IMAGE_LIMIT_PERIOD = ROLE_IMAGE_LIMITS[DEFAULT_QUOTA_ROLE] ?? 0;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DAILY_RESET_STREAK_MS = 48 * 60 * 60 * 1000;
const DAILY_BASE_REWARD = 500;
const DAILY_STREAK_BONUS = 50;
const DAILY_STREAK_BONUS_CAP = 1000;

const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_SUITS = ['S', 'H', 'D', 'C'];

function createShuffledDeck() {
    const deck = [];
    for (const suit of CARD_SUITS) {
        for (const rank of CARD_RANKS) {
            deck.push({ rank, suit });
        }
    }

    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
}

function drawCard(deck) {
    return deck.pop();
}

function cardPoint(card) {
    if (!card) return 0;
    if (['J', 'Q', 'K'].includes(card.rank)) return 10;
    if (card.rank === 'A') return 11;
    return Number(card.rank);
}

function handScore(hand) {
    let total = hand.reduce((sum, card) => sum + cardPoint(card), 0);
    let aces = hand.filter((card) => card.rank === 'A').length;

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return total;
}

function isBlackjack(hand) {
    return hand.length === 2 && handScore(hand) === 21;
}

function handToText(hand) {
    return hand.map((card) => `${card.rank}${card.suit}`).join(' ');
}

class MariaModDB {
    async initTables() {
        try {
                        await ensureMariaTables([
                                'mod_settings',
                                'mod_warnings',
                                'mod_logs',
                                'guild_settings',
                                'command_toggles',
                                'bot_settings',
                                'user_levels',
                                'user_consents',
                                'user_profiles',
                                'user_economy',
                                'lvoice_config',
                                'lvoice_active',
                                'system_notices',
                        ], 'MariaModDB');

                        logger.info('mariadb', 'Core MariaDB tables validated');
            return true;
        } catch (error) {
                        logger.error('mariadb', 'Error validating MariaDB schema:', error);
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
            logger.error('mariadb', `Error getting bot setting ${key}:`, error);
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
            logger.error('mariadb', `Error setting bot setting ${key}:`, error);
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
            logger.error('mariadb', 'Error getting mod settings:', error);
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
            logger.error('mariadb', 'Error setting mod settings:', error);
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
            logger.error('mariadb', 'Error adding warning:', error);
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
            logger.error('mariadb', 'Error getting warnings:', error);
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
            logger.error('mariadb', 'Error getting warning count:', error);
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
            logger.error('mariadb', 'Error clearing warnings:', error);
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
            logger.error('mariadb', 'Error clearing latest warning:', error);
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
            logger.error('mariadb', 'Error adding mod log:', error);
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
            logger.error('mariadb', 'Error getting mod logs:', error);
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
                // Bỏ qua lỗi parse và mặc định dùng mảng rỗng
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
            logger.error('mariadb', 'Error getting guild settings:', error);
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
            logger.error('mariadb', `Error updating guild settings for ${guildId}:`, error);
            return false;
        }
    }

    async deleteGuildData(guildId) {
        try {
            const guildScopedTables = [
                'guild_settings',
                'server_prefixes',
                'command_toggles',
                'mod_settings',
                'mod_warnings',
                'mod_logs',
                'user_levels',
                'lvoice_config',
                'lvoice_active'
            ];

            for (const tableName of guildScopedTables) {
                await mariaClient.query(
                    `DELETE FROM ${tableName} WHERE guild_id = ?`,
                    [guildId]
                );
            }

            return true;
        } catch (error) {
            logger.error('mariadb', `Error deleting guild data for ${guildId}:`, error);
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
            logger.error('mariadb', `Error setting XP exception for ${guildId}:`, error);
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
            logger.error('mariadb', 'Error disabling command:', error);
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
            logger.error('mariadb', 'Error enabling command:', error);
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
            logger.error('mariadb', 'Error disabling all commands:', error);
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
            logger.error('mariadb', 'Error enabling all commands:', error);
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
            logger.error('mariadb', 'Error getting disabled commands:', error);
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
            logger.error('mariadb', 'Error checking command status:', error);
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
            logger.error('mariadb', 'Error getting user XP:', error);
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
            logger.error('mariadb', 'Error setting user XP:', error);
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
            logger.error('mariadb', 'Error getting guild leaderboard:', error);
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
            logger.error('mariadb', 'Error getting user rank:', error);
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
            logger.error('mariadb', 'Error getting user profile:', error);
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
            logger.error('mariadb', 'Error updating user profile:', error);
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
            logger.error('mariadb', 'Error getting user economy:', error);
            return null;
        }
    }

    async getUserCredits(userId) {
        try {
            const economy = await this.getUserEconomy(userId);
            return Number(economy?.wallet || 0);
        } catch (error) {
            logger.error('mariadb', 'Error getting user credits:', error);
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
            logger.error('mariadb', 'Error setting user credits:', error);
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
            logger.error('mariadb', 'Error adding user credits:', error);
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
            logger.error('mariadb', 'Error transferring user credits:', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    async claimDailyCredits(userId) {
        let conn;
        try {
            await mariaClient.connect();
            conn = await mariaClient.pool.getConnection();
            await conn.beginTransaction();

            await conn.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [userId]);
            const rows = await conn.query(
                'SELECT wallet, streak_current, streak_alltime, streak_timestamp FROM user_economy WHERE user_id = ? FOR UPDATE',
                [userId]
            );

            const economy = rows[0] || {};
            const now = Date.now();
            const lastClaimAt = Number(economy.streak_timestamp || 0);
            const elapsed = now - lastClaimAt;

            if (lastClaimAt > 0 && elapsed < DAILY_COOLDOWN_MS) {
                await conn.rollback();
                return {
                    claimed: false,
                    remainingMs: DAILY_COOLDOWN_MS - elapsed,
                    nextClaimAt: lastClaimAt + DAILY_COOLDOWN_MS,
                };
            }

            const previousStreak = Number(economy.streak_current || 0);
            const resetStreak = lastClaimAt > 0 && elapsed > DAILY_RESET_STREAK_MS;
            const streak = resetStreak ? 1 : previousStreak + 1;
            const streakBonus = Math.min(DAILY_STREAK_BONUS_CAP, Math.max(0, streak - 1) * DAILY_STREAK_BONUS);
            const reward = DAILY_BASE_REWARD + streakBonus;
            const walletBefore = Number(economy.wallet || 0);
            const walletAfter = walletBefore + reward;

            await conn.query(
                `UPDATE user_economy
                 SET wallet = wallet + ?,
                     streak_current = ?,
                     streak_alltime = GREATEST(streak_alltime, ?),
                     streak_timestamp = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = ?`,
                [reward, streak, streak, now, userId]
            );

            await conn.commit();

            return {
                claimed: true,
                reward,
                streak,
                streakBonus,
                walletBefore,
                walletAfter,
                nextClaimAt: now + DAILY_COOLDOWN_MS,
            };
        } catch (error) {
            if (conn) {
                try { await conn.rollback(); } catch { }
            }
            logger.error('mariadb', 'Error claiming daily credits:', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    async playCoinflip(userId, amount, choice) {
        let conn;
        try {
            const bet = Math.trunc(Number(amount) || 0);
            const normalizedChoice = String(choice || '').toLowerCase();

            if (bet <= 0) {
                throw new Error('Số tiền cược phải lớn hơn 0.');
            }

            if (!['heads', 'tails', 'h', 't'].includes(normalizedChoice)) {
                throw new Error('Lựa chọn phải là heads hoặc tails.');
            }

            const userChoice = normalizedChoice.startsWith('h') ? 'heads' : 'tails';
            const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
            const win = userChoice === outcome;

            await mariaClient.connect();
            conn = await mariaClient.pool.getConnection();
            await conn.beginTransaction();

            await conn.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [userId]);
            const rows = await conn.query('SELECT wallet FROM user_economy WHERE user_id = ? FOR UPDATE', [userId]);
            const walletBefore = Number(rows[0]?.wallet || 0);

            if (walletBefore < bet) {
                throw new Error('Bạn không đủ credits để đặt cược.');
            }

            const delta = win ? bet : -bet;
            const walletAfter = walletBefore + delta;

            await conn.query(
                'UPDATE user_economy SET wallet = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [walletAfter, userId]
            );

            await conn.commit();

            return {
                win,
                outcome,
                userChoice,
                bet,
                delta,
                walletBefore,
                walletAfter,
            };
        } catch (error) {
            if (conn) {
                try { await conn.rollback(); } catch { }
            }
            logger.error('mariadb', 'Error running coinflip:', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    async playBlackjack(userId, amount) {
        let conn;
        try {
            const bet = Math.trunc(Number(amount) || 0);
            if (bet <= 0) {
                throw new Error('Số tiền cược phải lớn hơn 0.');
            }

            await mariaClient.connect();
            conn = await mariaClient.pool.getConnection();
            await conn.beginTransaction();

            await conn.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [userId]);
            const rows = await conn.query('SELECT wallet FROM user_economy WHERE user_id = ? FOR UPDATE', [userId]);
            const walletBefore = Number(rows[0]?.wallet || 0);

            if (walletBefore < bet) {
                throw new Error('Bạn không đủ credits để đặt cược.');
            }

            const deck = createShuffledDeck();
            const player = [drawCard(deck), drawCard(deck)];
            const dealer = [drawCard(deck), drawCard(deck)];

            const playerBlackjack = isBlackjack(player);
            const dealerBlackjack = isBlackjack(dealer);

            if (!playerBlackjack) {
                while (handScore(player) < 17) {
                    player.push(drawCard(deck));
                }
            }

            if (!dealerBlackjack) {
                while (handScore(dealer) < 17) {
                    dealer.push(drawCard(deck));
                }
            }

            const playerScore = handScore(player);
            const dealerScore = handScore(dealer);
            const playerBust = playerScore > 21;
            const dealerBust = dealerScore > 21;

            let outcome = 'lose';
            let delta = -bet;

            if (playerBlackjack && dealerBlackjack) {
                outcome = 'push';
                delta = 0;
            } else if (playerBlackjack) {
                outcome = 'blackjack';
                delta = Math.floor(bet * 1.5);
            } else if (dealerBlackjack) {
                outcome = 'lose';
                delta = -bet;
            } else if (playerBust && dealerBust) {
                outcome = 'push';
                delta = 0;
            } else if (playerBust) {
                outcome = 'lose';
                delta = -bet;
            } else if (dealerBust) {
                outcome = 'win';
                delta = bet;
            } else if (playerScore > dealerScore) {
                outcome = 'win';
                delta = bet;
            } else if (playerScore < dealerScore) {
                outcome = 'lose';
                delta = -bet;
            } else {
                outcome = 'push';
                delta = 0;
            }

            const walletAfter = Math.max(0, walletBefore + delta);

            await conn.query(
                'UPDATE user_economy SET wallet = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [walletAfter, userId]
            );

            await conn.commit();

            return {
                outcome,
                bet,
                delta,
                walletBefore,
                walletAfter,
                player: {
                    cards: handToText(player),
                    score: playerScore,
                    blackjack: playerBlackjack,
                    bust: playerBust,
                },
                dealer: {
                    cards: handToText(dealer),
                    score: dealerScore,
                    blackjack: dealerBlackjack,
                    bust: dealerBust,
                },
            };
        } catch (error) {
            if (conn) {
                try { await conn.rollback(); } catch { }
            }
            logger.error('mariadb', 'Error running blackjack:', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    async beginBlackjackBet(userId, amount) {
        let conn;
        try {
            const bet = Math.trunc(Number(amount) || 0);
            if (bet <= 0) {
                throw new Error('Số tiền cược phải lớn hơn 0.');
            }

            await mariaClient.connect();
            conn = await mariaClient.pool.getConnection();
            await conn.beginTransaction();

            await conn.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [userId]);
            const rows = await conn.query('SELECT wallet FROM user_economy WHERE user_id = ? FOR UPDATE', [userId]);
            const walletBefore = Number(rows[0]?.wallet || 0);

            if (walletBefore < bet) {
                throw new Error('Bạn không đủ credits để đặt cược.');
            }

            const walletAfter = walletBefore - bet;
            await conn.query(
                'UPDATE user_economy SET wallet = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [walletAfter, userId]
            );

            await conn.commit();
            return { bet, walletBefore, walletAfter };
        } catch (error) {
            if (conn) {
                try { await conn.rollback(); } catch { }
            }
            logger.error('mariadb', 'Error beginning blackjack bet:', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    async settleBlackjackBet(userId, amountToAdd = 0) {
        let conn;
        try {
            const payout = Math.max(0, Math.trunc(Number(amountToAdd) || 0));

            await mariaClient.connect();
            conn = await mariaClient.pool.getConnection();
            await conn.beginTransaction();

            await conn.query('INSERT IGNORE INTO user_economy (user_id) VALUES (?)', [userId]);
            const rows = await conn.query('SELECT wallet FROM user_economy WHERE user_id = ? FOR UPDATE', [userId]);
            const walletBefore = Number(rows[0]?.wallet || 0);
            const walletAfter = walletBefore + payout;

            await conn.query(
                'UPDATE user_economy SET wallet = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [walletAfter, userId]
            );

            await conn.commit();
            return { payout, walletBefore, walletAfter };
        } catch (error) {
            if (conn) {
                try { await conn.rollback(); } catch { }
            }
            logger.error('mariadb', 'Error settling blackjack bet:', error);
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
            logger.error('mariadb', 'Error purchasing quota with credits:', error);
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
            logger.error('mariadb', 'Error updating user economy:', error);
            return false;
        }
    }

    async createSystemNotice({ message, guildId = null, startsAt, expiresAt, createdBy }) {
        try {
            await mariaClient.query(
                `INSERT INTO system_notices (guild_id, message, starts_at, expires_at, is_active, created_by)
                 VALUES (?, ?, ?, ?, 1, ?)`,
                [guildId, message, startsAt, expiresAt, createdBy]
            );

            const [row] = await mariaClient.query('SELECT LAST_INSERT_ID() AS id');
            return Number(row?.id || 0);
        } catch (error) {
            logger.error('mariadb', 'Error creating system notice:', error);
            throw error;
        }
    }

    async getActiveSystemNotice(guildId = null) {
        try {
            const rows = await mariaClient.query(
                `SELECT id, guild_id, message, starts_at, expires_at, created_by, created_at
                 FROM system_notices
                 WHERE is_active = 1
                   AND starts_at <= NOW()
                   AND expires_at > NOW()
                   AND (guild_id IS NULL OR guild_id = ?)
                 ORDER BY CASE WHEN guild_id = ? THEN 0 ELSE 1 END, id DESC
                 LIMIT 1`,
                [guildId, guildId]
            );

            if (!rows.length) {
                return null;
            }

            const notice = rows[0];
            return {
                id: notice.id,
                guildId: notice.guild_id,
                message: notice.message,
                startsAt: notice.starts_at,
                expiresAt: notice.expires_at,
                createdBy: notice.created_by,
                createdAt: notice.created_at,
            };
        } catch (error) {
            logger.error('mariadb', 'Error getting active system notice:', error);
            return null;
        }
    }

    async listSystemNotices({ guildId = null, limit = 10 } = {}) {
        try {
            const safeLimit = Math.max(1, Math.min(50, Math.trunc(Number(limit) || 10)));
            const rows = guildId
                ? await mariaClient.query(
                    `SELECT id, guild_id, message, starts_at, expires_at, is_active, created_by, created_at
                     FROM system_notices
                     WHERE guild_id = ? OR guild_id IS NULL
                     ORDER BY id DESC
                     LIMIT ?`,
                    [guildId, safeLimit]
                )
                : await mariaClient.query(
                    `SELECT id, guild_id, message, starts_at, expires_at, is_active, created_by, created_at
                     FROM system_notices
                     ORDER BY id DESC
                     LIMIT ?`,
                    [safeLimit]
                );

            return rows.map((row) => ({
                id: row.id,
                guildId: row.guild_id,
                message: row.message,
                startsAt: row.starts_at,
                expiresAt: row.expires_at,
                isActive: !!row.is_active,
                createdBy: row.created_by,
                createdAt: row.created_at,
            }));
        } catch (error) {
            logger.error('mariadb', 'Error listing system notices:', error);
            return [];
        }
    }

    async deactivateSystemNotice(noticeId) {
        try {
            const result = await mariaClient.query(
                'UPDATE system_notices SET is_active = 0 WHERE id = ? AND is_active = 1',
                [noticeId]
            );
            return Number(result?.affectedRows || 0) > 0;
        } catch (error) {
            logger.error('mariadb', 'Error deactivating system notice:', error);
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
            logger.error('mariadb', 'Error resetting user profile data:', error);
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
            logger.error('mariadb', 'Error getting LVoice config:', error);
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
            logger.error('mariadb', 'Error setting LVoice config:', error);
            return false;
        }
    }

    async deleteLVoiceConfig(guildId) {
        try {
            await mariaClient.query('DELETE FROM lvoice_config WHERE guild_id = ?', [guildId]);
            await mariaClient.query('DELETE FROM lvoice_active WHERE guild_id = ?', [guildId]);
            return true;
        } catch (error) {
            logger.error('mariadb', 'Error deleting LVoice config:', error);
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
            logger.error('mariadb', 'Error adding active voice:', error);
            return false;
        }
    }

    async removeActiveVoice(channelId) {
        try {
            await mariaClient.query('DELETE FROM lvoice_active WHERE channel_id = ?', [channelId]);
            return true;
        } catch (error) {
            logger.error('mariadb', 'Error removing active voice:', error);
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
            logger.error('mariadb', 'Error getting active voice:', error);
            return null;
        }
    }

    async getAllActiveVoices() {
        try {
            const rows = await mariaClient.query('SELECT * FROM lvoice_active');
            return rows.map(r => ({ channelId: r.channel_id, guildId: r.guild_id, ownerId: r.owner_id }));
        } catch (error) {
            logger.error('mariadb', 'Error getting all active voices:', error);
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
            logger.error('mariadb', 'Error getting all VoiceMaster configs:', error);
            return [];
        }
    }
}

module.exports = new MariaModDB();
