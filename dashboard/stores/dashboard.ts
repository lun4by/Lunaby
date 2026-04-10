import { defineStore } from 'pinia'
import type {
  BotSettingItem,
  GuildDashboardPayload,
  GuildSettingsPayload,
  LVoicePayload,
  ModSettingsPayload,
  UserPersonalizationPayload,
} from '~/types/dashboard'

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    guildPayload: null as GuildDashboardPayload | null,
    botSettings: [] as BotSettingItem[],
    userPersonalization: null as UserPersonalizationPayload | null,
    loading: false,
    saving: false,
    error: '' as string,
  }),

  actions: {
    async fetchGuild(guildId: string) {
      this.loading = true
      this.error = ''

      try {
        this.guildPayload = await $fetch<GuildDashboardPayload>(`/api/guilds/${guildId}`)
        return this.guildPayload
      } catch (error: any) {
        this.error = error?.data?.message || error?.message || 'Unable to load guild data'
        throw error
      } finally {
        this.loading = false
      }
    },

    async saveGuildSettings(
      guildId: string,
      payload: {
        settings: GuildSettingsPayload
        modSettings: ModSettingsPayload
      },
    ) {
      this.saving = true

      try {
        await $fetch(`/api/guilds/${guildId}/settings`, {
          method: 'PATCH',
          body: payload,
        })
        await this.fetchGuild(guildId)
      } finally {
        this.saving = false
      }
    },

    async saveLVoice(guildId: string, payload: LVoicePayload) {
      this.saving = true

      try {
        await $fetch(`/api/guilds/${guildId}/lvoice`, {
          method: 'PATCH',
          body: payload,
        })
        await this.fetchGuild(guildId)
      } finally {
        this.saving = false
      }
    },

    async fetchBotSettings() {
      const result = await $fetch<{ items: BotSettingItem[] }>('/api/bot-settings')
      this.botSettings = result.items
      return this.botSettings
    },

    async saveBotSetting(payload: { key: string, value: string, updatedBy?: string }) {
      this.saving = true

      try {
        await $fetch('/api/bot-settings', {
          method: 'PATCH',
          body: {
            key: payload.key,
            value: payload.value,
            updatedBy: payload.updatedBy || 'dashboard',
          },
        })
        await this.fetchBotSettings()
      } finally {
        this.saving = false
      }
    },

    async fetchUserPersonalization(userId: string) {
      this.loading = true

      try {
        this.userPersonalization = await $fetch<UserPersonalizationPayload>(`/api/users/${userId}`)
        return this.userPersonalization
      } finally {
        this.loading = false
      }
    },

    async saveUserPersonalization(userId: string, payload: Omit<UserPersonalizationPayload, 'userId'>) {
      this.saving = true

      try {
        await $fetch(`/api/users/${userId}`, {
          method: 'PATCH',
          body: payload,
        })
        await this.fetchUserPersonalization(userId)
      } finally {
        this.saving = false
      }
    },
  },
})
