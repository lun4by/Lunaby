import type {
  BotSettingItem,
  GuildDashboardPayload,
  GuildSettingsPayload,
  LVoicePayload,
  ModSettingsPayload,
  UserPersonalizationPayload,
} from '~/types/dashboard'
import { dbQuery } from './db'

type Row = Record<string, any>

function parseJson(value: unknown, fallback: any) {
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }

  if (value && typeof value === 'object') {
    return value
  }

  return fallback
}

function normalizeNullable(value: unknown) {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function mapGuildSettings(row?: Row): GuildSettingsPayload {
  return {
    prefix: row?.prefix ?? null,
    language: row?.language || 'vi',
    xp: {
      isActive: Boolean(row?.xp_active),
      exceptions: Array.isArray(parseJson(row?.xp_exceptions, [])) ? parseJson(row?.xp_exceptions, []) : [],
    },
    greeter: {
      welcome: {
        isEnabled: Boolean(row?.welcome_enabled),
        channel: row?.welcome_channel ?? null,
        message: row?.welcome_message ?? null,
      },
      leaving: {
        isEnabled: Boolean(row?.leaving_enabled),
        channel: row?.leaving_channel ?? null,
        message: row?.leaving_message ?? null,
      },
    },
    voiceToggle: {
      isEnabled: Boolean(row?.voice_toggle_enabled),
    },
    roles: {
      muted: row?.muted_role ?? null,
    },
    channels: {
      suggest: row?.suggest_channel ?? null,
      voteLog: row?.vote_log_channel ?? null,
    },
    settings: {
      levelUpNotifications: row?.level_up_notifications !== 0,
      levelUpChannel: row?.level_up_channel ?? null,
      useEmbeds: row?.use_embeds !== 0,
    },
  }
}

function mapModSettings(row?: Row): ModSettingsPayload {
  return {
    logChannelId: row?.log_channel_id ?? null,
    modActionLogs: row?.mod_action_logs !== 0,
    monitorLogs: row?.monitor_logs !== 0,
  }
}

function mapLVoice(row?: Row): LVoicePayload | null {
  if (!row) {
    return null
  }

  return {
    creatorChannelId: row.creator_channel_id ?? null,
    categoryId: row.category_id ?? null,
    defaultName: row.default_name || '{user}',
    defaultLimit: Number(row.default_limit || 0),
    defaultBitrate: Number(row.default_bitrate || 64000),
  }
}

function defaultUserPersonalization(userId: string): UserPersonalizationPayload {
  return {
    userId,
    occupation: null,
    customInstructions: null,
    allowSearchHistoryReference: true,
    allowMemoryStorage: true,
  }
}

function mapUserPersonalization(userId: string, row?: Row): UserPersonalizationPayload {
  if (!row) {
    return defaultUserPersonalization(userId)
  }

  const extra = parseJson(row.extra_data, {})
  const personalInfo = parseJson(extra.personalInfo, {})
  const privacy = parseJson(extra.privacy, {})

  return {
    userId,
    occupation: personalInfo.occupation ?? null,
    customInstructions: personalInfo.customInstructions ?? null,
    allowSearchHistoryReference: privacy.allowSearchHistoryReference !== false,
    allowMemoryStorage: privacy.allowMemoryStorage !== false,
  }
}

export async function getGuildDashboard(guildId: string): Promise<GuildDashboardPayload> {
  const [
    guildRows,
    modRows,
    lvoiceRows,
    totalGuildRows,
    totalProfileRows,
    consentRows,
    xpGuildRows,
    topXpRows,
    walletRows,
    warningRows,
    modLogRows,
    latestModLogRows,
    languageRows,
  ] = await Promise.all([
    dbQuery('SELECT * FROM guild_settings WHERE guild_id = ? LIMIT 1', [guildId]),
    dbQuery('SELECT * FROM mod_settings WHERE guild_id = ? LIMIT 1', [guildId]),
    dbQuery('SELECT * FROM lvoice_config WHERE guild_id = ? LIMIT 1', [guildId]),
    dbQuery<{ count: number }>('SELECT COUNT(*) AS count FROM guild_settings'),
    dbQuery<{ count: number }>('SELECT COUNT(*) AS count FROM user_profiles'),
    dbQuery<{ count: number }>('SELECT COUNT(*) AS count FROM user_consents WHERE consented = TRUE'),
    dbQuery<{ count: number }>('SELECT COUNT(*) AS count FROM guild_settings WHERE xp_active = TRUE'),
    dbQuery<{ guild_id: string, user_id: string, xp: number, level: number }>(
      'SELECT guild_id, user_id, xp, level FROM user_levels ORDER BY xp DESC LIMIT 5',
    ),
    dbQuery<{ user_id: string, wallet: number }>(
      'SELECT user_id, wallet FROM user_economy ORDER BY wallet DESC LIMIT 5',
    ),
    dbQuery<{ count: number }>('SELECT COUNT(*) AS count FROM mod_warnings'),
    dbQuery<{ count: number }>('SELECT COUNT(*) AS count FROM mod_logs'),
    dbQuery<{ id: number, action: string, reason: string | null, target_id: string | null, moderator_id: string | null, created_at: string }>(
      'SELECT id, action, reason, target_id, moderator_id, created_at FROM mod_logs ORDER BY created_at DESC LIMIT 5',
    ),
    dbQuery<{ language: string | null, count: number }>(
      'SELECT COALESCE(language, "vi") AS language, COUNT(*) AS count FROM guild_settings GROUP BY COALESCE(language, "vi") ORDER BY count DESC',
    ),
  ])

  const languageTotal = languageRows.reduce((sum, item) => sum + Number(item.count || 0), 0)

  return {
    guild: {
      id: guildId,
      label: `Guild ${guildId}`,
    },
    overview: {
      totalGuilds: Number(totalGuildRows[0]?.count || 0),
      totalProfiles: Number(totalProfileRows[0]?.count || 0),
      consentedUsers: Number(consentRows[0]?.count || 0),
      xpEnabledGuilds: Number(xpGuildRows[0]?.count || 0),
    },
    settings: mapGuildSettings(guildRows[0]),
    modSettings: mapModSettings(modRows[0]),
    lvoice: mapLVoice(lvoiceRows[0]),
    analytics: {
      totalWalletCredits: walletRows.reduce((sum, item) => sum + Number(item.wallet || 0), 0),
      warningCount: Number(warningRows[0]?.count || 0),
      modLogCount: Number(modLogRows[0]?.count || 0),
      topXpUsers: topXpRows.map(item => ({
        guildId: item.guild_id,
        userId: item.user_id,
        xp: Number(item.xp || 0),
        level: Number(item.level || 1),
      })),
      richestUsers: walletRows.map(item => ({
        userId: item.user_id,
        wallet: Number(item.wallet || 0),
      })),
      recentModLogs: latestModLogRows.map(item => ({
        id: item.id,
        action: item.action,
        reason: item.reason,
        targetId: item.target_id,
        moderatorId: item.moderator_id,
        createdAt: new Date(item.created_at).toLocaleString('vi-VN'),
      })),
      languageDistribution: languageRows.map(item => ({
        language: item.language || 'vi',
        count: Number(item.count || 0),
        ratio: languageTotal ? Math.round((Number(item.count || 0) / languageTotal) * 100) : 0,
      })),
    },
  }
}

export async function getBotSettings(): Promise<BotSettingItem[]> {
  const rows = await dbQuery<{ setting_key: string, setting_value: string | null, updated_by: string | null, updated_at: string }>(
    'SELECT setting_key, setting_value, updated_by, updated_at FROM bot_settings ORDER BY setting_key ASC',
  )

  return rows.map(row => ({
    key: row.setting_key,
    value: row.setting_value ?? '',
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at,
  }))
}

export async function saveBotSetting(key: string, value: string, updatedBy: string) {
  await dbQuery(
    `INSERT INTO bot_settings (setting_key, setting_value, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       updated_by = VALUES(updated_by)`,
    [key, value, updatedBy],
  )
}

export async function saveGuildSettings(
  guildId: string,
  payload: {
    settings: GuildSettingsPayload
    modSettings: ModSettingsPayload
  },
) {
  const { settings, modSettings } = payload

  await dbQuery('INSERT IGNORE INTO guild_settings (guild_id) VALUES (?)', [guildId])
  await dbQuery('INSERT IGNORE INTO mod_settings (guild_id) VALUES (?)', [guildId])

  await dbQuery(
    `UPDATE guild_settings
     SET prefix = ?,
         xp_active = ?,
         xp_exceptions = ?,
         welcome_enabled = ?,
         welcome_channel = ?,
         welcome_message = ?,
         leaving_enabled = ?,
         leaving_channel = ?,
         leaving_message = ?,
         muted_role = ?,
         suggest_channel = ?,
         level_up_notifications = ?,
         level_up_channel = ?,
         use_embeds = ?,
         voice_toggle_enabled = ?,
         vote_log_channel = ?,
         language = ?
     WHERE guild_id = ?`,
    [
      normalizeNullable(settings.prefix),
      settings.xp.isActive,
      JSON.stringify(settings.xp.exceptions),
      settings.greeter.welcome.isEnabled,
      normalizeNullable(settings.greeter.welcome.channel),
      normalizeNullable(settings.greeter.welcome.message),
      settings.greeter.leaving.isEnabled,
      normalizeNullable(settings.greeter.leaving.channel),
      normalizeNullable(settings.greeter.leaving.message),
      normalizeNullable(settings.roles.muted),
      normalizeNullable(settings.channels.suggest),
      settings.settings.levelUpNotifications,
      normalizeNullable(settings.settings.levelUpChannel),
      settings.settings.useEmbeds,
      settings.voiceToggle.isEnabled,
      normalizeNullable(settings.channels.voteLog),
      settings.language || 'vi',
      guildId,
    ],
  )

  await dbQuery(
    `UPDATE mod_settings
     SET log_channel_id = ?,
         mod_action_logs = ?,
         monitor_logs = ?,
         updated_by = ?
     WHERE guild_id = ?`,
    [
      normalizeNullable(modSettings.logChannelId),
      modSettings.modActionLogs,
      modSettings.monitorLogs,
      'dashboard',
      guildId,
    ],
  )
}

export async function saveLVoiceConfig(guildId: string, payload: LVoicePayload) {
  await dbQuery(
    `INSERT INTO lvoice_config (guild_id, creator_channel_id, category_id, default_name, default_limit, default_bitrate)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       creator_channel_id = VALUES(creator_channel_id),
       category_id = VALUES(category_id),
       default_name = VALUES(default_name),
       default_limit = VALUES(default_limit),
       default_bitrate = VALUES(default_bitrate)`,
    [
      guildId,
      normalizeNullable(payload.creatorChannelId),
      normalizeNullable(payload.categoryId),
      payload.defaultName,
      payload.defaultLimit,
      payload.defaultBitrate,
    ],
  )
}

export async function getUserPersonalization(userId: string) {
  const rows = await dbQuery<{ user_id: string, extra_data: string | null }>(
    'SELECT user_id, extra_data FROM user_profiles WHERE user_id = ? LIMIT 1',
    [userId],
  )

  return mapUserPersonalization(userId, rows[0])
}

export async function saveUserPersonalization(
  userId: string,
  payload: Omit<UserPersonalizationPayload, 'userId'>,
) {
  const existingRows = await dbQuery<{ extra_data: string | null }>(
    'SELECT extra_data FROM user_profiles WHERE user_id = ? LIMIT 1',
    [userId],
  )

  const currentExtra = parseJson(existingRows[0]?.extra_data, {})
  currentExtra.personalInfo = {
    ...(parseJson(currentExtra.personalInfo, {})),
    occupation: normalizeNullable(payload.occupation),
    customInstructions: normalizeNullable(payload.customInstructions),
  }
  currentExtra.privacy = {
    ...(parseJson(currentExtra.privacy, {})),
    allowSearchHistoryReference: payload.allowSearchHistoryReference,
    allowMemoryStorage: payload.allowMemoryStorage,
  }

  await dbQuery('INSERT IGNORE INTO user_profiles (user_id) VALUES (?)', [userId])
  await dbQuery(
    'UPDATE user_profiles SET extra_data = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [JSON.stringify(currentExtra), userId],
  )
}
