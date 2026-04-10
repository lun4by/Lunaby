export interface GuildSettingsPayload {
  prefix: string | null
  language: string
  xp: {
    isActive: boolean
    exceptions: string[]
  }
  greeter: {
    welcome: {
      isEnabled: boolean
      channel: string | null
      message: string | null
    }
    leaving: {
      isEnabled: boolean
      channel: string | null
      message: string | null
    }
  }
  voiceToggle: {
    isEnabled: boolean
  }
  roles: {
    muted: string | null
  }
  channels: {
    suggest: string | null
    voteLog: string | null
  }
  settings: {
    levelUpNotifications: boolean
    levelUpChannel: string | null
    useEmbeds: boolean
  }
}

export interface ModSettingsPayload {
  logChannelId: string | null
  modActionLogs: boolean
  monitorLogs: boolean
}

export interface LVoicePayload {
  creatorChannelId: string | null
  categoryId: string | null
  defaultName: string
  defaultLimit: number
  defaultBitrate: number
}

export interface UserPersonalizationPayload {
  userId: string
  occupation: string | null
  customInstructions: string | null
  allowSearchHistoryReference: boolean
  allowMemoryStorage: boolean
}

export interface BotSettingItem {
  key: string
  value: string
  updatedBy: string | null
  updatedAt: string
}

export interface GuildDashboardPayload {
  guild: {
    id: string
    label: string
  }
  overview: {
    totalGuilds: number
    totalProfiles: number
    consentedUsers: number
    xpEnabledGuilds: number
  }
  settings: GuildSettingsPayload
  modSettings: ModSettingsPayload
  lvoice: LVoicePayload | null
  analytics: {
    totalWalletCredits: number
    warningCount: number
    modLogCount: number
    topXpUsers: Array<{
      guildId: string
      userId: string
      xp: number
      level: number
    }>
    richestUsers: Array<{
      userId: string
      wallet: number
    }>
    recentModLogs: Array<{
      id: number
      action: string
      reason: string | null
      targetId: string | null
      moderatorId: string | null
      createdAt: string
    }>
    languageDistribution: Array<{
      language: string
      count: number
      ratio: number
    }>
  }
}
