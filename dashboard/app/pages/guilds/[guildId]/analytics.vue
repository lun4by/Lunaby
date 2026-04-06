<script setup lang="ts">
import { storeToRefs } from 'pinia'

const route = useRoute()
const dashboardStore = useDashboardStore()
const { guildPayload, loading } = storeToRefs(dashboardStore)

await useAsyncData(
  () => `analytics:${route.params.guildId}`,
  () => dashboardStore.fetchGuild(String(route.params.guildId)),
  { watch: [() => route.params.guildId] },
)
</script>

<template>
  <div v-if="guildPayload" class="space-y-6">
    <div class="grid gap-4 lg:grid-cols-3">
      <StatCard label="Total credits in economy" :value="guildPayload.analytics.totalWalletCredits" hint="Sum of user_economy.wallet" />
      <StatCard label="Tracked warnings" :value="guildPayload.analytics.warningCount" hint="Rows in mod_warnings" />
      <StatCard label="Tracked moderation logs" :value="guildPayload.analytics.modLogCount" hint="Rows in mod_logs" />
    </div>

    <div class="grid gap-6 xl:grid-cols-2">
      <SectionCard title="Richest users" description="Top wallet balances from `user_economy`.">
        <div class="space-y-3">
          <div
            v-for="item in guildPayload.analytics.richestUsers"
            :key="item.userId"
            class="flex items-center justify-between rounded-2xl border border-line bg-white/70 px-4 py-3"
          >
            <span class="text-sm font-semibold text-ink">{{ item.userId }}</span>
            <span class="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-ink">
              {{ item.wallet.toLocaleString() }} credits
            </span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Language distribution" description="Phân bố `guild_settings.language`.">
        <div class="space-y-3">
          <div
            v-for="item in guildPayload.analytics.languageDistribution"
            :key="item.language"
            class="rounded-2xl border border-line bg-white/70 px-4 py-3"
          >
            <div class="mb-2 flex items-center justify-between text-sm font-semibold text-ink">
              <span>{{ item.language }}</span>
              <span>{{ item.count }}</span>
            </div>
            <div class="h-2 rounded-full bg-stone-100">
              <div class="h-2 rounded-full bg-gradient-to-r from-rose to-peach" :style="{ width: `${item.ratio}%` }" />
            </div>
          </div>
        </div>
      </SectionCard>
    </div>

    <SectionCard title="Recent moderation activity" description="5 log mới nhất từ `mod_logs`.">
      <div class="space-y-3">
        <div
          v-for="item in guildPayload.analytics.recentModLogs"
          :key="item.id"
          class="rounded-2xl border border-line bg-white/70 px-4 py-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-ink">{{ item.action }}</p>
              <p class="text-xs text-stone-500">Moderator {{ item.moderatorId || 'unknown' }} -> Target {{ item.targetId || 'unknown' }}</p>
            </div>
            <span class="text-xs text-stone-500">{{ item.createdAt }}</span>
          </div>
          <p v-if="item.reason" class="mt-2 text-sm text-stone-600">{{ item.reason }}</p>
        </div>
      </div>
    </SectionCard>
  </div>

  <div v-else-if="loading" class="text-sm text-stone-600">
    Loading analytics...
  </div>
</template>
