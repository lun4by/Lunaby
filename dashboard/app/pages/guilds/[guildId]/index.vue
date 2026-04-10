<script setup lang="ts">
import { storeToRefs } from 'pinia'

const route = useRoute()
const dashboardStore = useDashboardStore()
const { guildPayload, loading, error } = storeToRefs(dashboardStore)

await useAsyncData(
  () => `guild:${route.params.guildId}`,
  () => dashboardStore.fetchGuild(String(route.params.guildId)),
  { watch: [() => route.params.guildId] },
)
</script>

<template>
  <div class="space-y-6">
    <SectionCard
      title="Guild overview"
      :description="guildPayload?.guild.label || 'MariaDB-backed configuration summary'"
      tone="hero"
    >
      <div v-if="loading" class="text-sm text-stone-600">Loading guild payload...</div>
      <div v-else-if="error" class="rounded-2xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose-700">
        {{ error }}
      </div>
      <div v-else-if="guildPayload" class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total guilds" :value="guildPayload.overview.totalGuilds" hint="Rows in guild_settings" />
        <StatCard label="Profiles" :value="guildPayload.overview.totalProfiles" hint="Rows in user_profiles" />
        <StatCard label="Consent accepted" :value="guildPayload.overview.consentedUsers" hint="user_consents.consented = true" />
        <StatCard label="XP active guilds" :value="guildPayload.overview.xpEnabledGuilds" hint="guild_settings.xp_active" />
      </div>
    </SectionCard>

    <div v-if="guildPayload" class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <SectionCard title="Guild config snapshot" description="Các cờ trạng thái chính lấy từ MariaDB.">
        <div class="grid gap-3 sm:grid-cols-2">
          <InfoChip label="Prefix" :value="guildPayload.settings.prefix || 'default'" />
          <InfoChip label="Language" :value="guildPayload.settings.language" />
          <InfoChip label="Welcome" :value="guildPayload.settings.greeter.welcome.isEnabled ? 'enabled' : 'disabled'" />
          <InfoChip label="Leaving" :value="guildPayload.settings.greeter.leaving.isEnabled ? 'enabled' : 'disabled'" />
          <InfoChip label="Level up" :value="guildPayload.settings.settings.levelUpNotifications ? 'enabled' : 'disabled'" />
          <InfoChip label="Voice welcome" :value="guildPayload.settings.voiceToggle.isEnabled ? 'enabled' : 'disabled'" />
          <InfoChip label="Vote log" :value="guildPayload.settings.channels.voteLog || 'not set'" />
          <InfoChip label="Suggest channel" :value="guildPayload.settings.channels.suggest || 'not set'" />
        </div>
      </SectionCard>

      <SectionCard title="Top users by XP" description="Lấy từ `user_levels`.">
        <div class="space-y-3">
          <div
            v-for="item in guildPayload.analytics.topXpUsers"
            :key="`${item.guildId}:${item.userId}`"
            class="flex items-center justify-between rounded-2xl border border-line bg-white/70 px-4 py-3"
          >
            <div>
              <p class="text-sm font-semibold text-ink">{{ item.userId }}</p>
              <p class="text-xs text-stone-500">Guild {{ item.guildId }}</p>
            </div>
            <div class="text-right">
              <p class="text-sm font-semibold text-ink">{{ item.xp.toLocaleString() }} XP</p>
              <p class="text-xs text-stone-500">Level {{ item.level }}</p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  </div>
</template>
