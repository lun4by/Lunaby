<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { GuildSettingsPayload, ModSettingsPayload } from '~/types/dashboard'

const route = useRoute()
const dashboardStore = useDashboardStore()
const { guildPayload, saving } = storeToRefs(dashboardStore)

const form = reactive<GuildSettingsPayload>({
  prefix: null,
  language: 'vi',
  xp: { isActive: false, exceptions: [] },
  greeter: {
    welcome: { isEnabled: false, channel: null, message: null },
    leaving: { isEnabled: false, channel: null, message: null },
  },
  voiceToggle: { isEnabled: false },
  roles: { muted: null },
  channels: { suggest: null, voteLog: null },
  settings: { levelUpNotifications: true, levelUpChannel: null, useEmbeds: true },
})

const modForm = reactive<ModSettingsPayload>({
  logChannelId: null,
  modActionLogs: true,
  monitorLogs: true,
})

await useAsyncData(
  () => `settings:${route.params.guildId}`,
  () => dashboardStore.fetchGuild(String(route.params.guildId)),
  { watch: [() => route.params.guildId] },
)

watch(
  () => guildPayload.value,
  (payload) => {
    if (!payload) {
      return
    }

    Object.assign(form, structuredClone(payload.settings))
    Object.assign(modForm, structuredClone(payload.modSettings))
  },
  { immediate: true },
)

async function save() {
  await dashboardStore.saveGuildSettings(String(route.params.guildId), {
    settings: form,
    modSettings: modForm,
  })
}
</script>

<template>
  <div v-if="guildPayload" class="space-y-6">
    <div class="grid gap-6 xl:grid-cols-2">
      <SectionCard title="General settings" description="Bám theo các command `setting`, `levelup`, `votelog`, `voicewelcome`, `welcome`.">
        <div class="grid gap-4">
          <FieldInput v-model="form.prefix" label="Prefix" placeholder="!" />
          <FieldInput v-model="form.language" label="Language" placeholder="vi" />
          <FieldInput v-model="form.roles.muted" label="Muted role ID" placeholder="123..." />
          <FieldInput v-model="form.channels.suggest" label="Suggest channel ID" placeholder="123..." />
          <FieldInput v-model="form.channels.voteLog" label="Vote log channel ID" placeholder="123..." />
          <FieldInput v-model="form.settings.levelUpChannel" label="Level up channel ID" placeholder="123..." />
        </div>
      </SectionCard>

      <SectionCard title="Toggles" description="Bật/tắt các feature flags lưu trong `guild_settings` và `mod_settings`.">
        <div class="grid gap-4">
          <ToggleField v-model="form.xp.isActive" label="XP active" caption="guild_settings.xp_active" />
          <ToggleField v-model="form.settings.levelUpNotifications" label="Level up notifications" caption="settings.levelUpNotifications" />
          <ToggleField v-model="form.settings.useEmbeds" label="Use embeds" caption="settings.useEmbeds" />
          <ToggleField v-model="form.voiceToggle.isEnabled" label="Voice welcome" caption="voiceToggle.isEnabled" />
          <ToggleField v-model="form.greeter.welcome.isEnabled" label="Welcome enabled" caption="greeter.welcome.isEnabled" />
          <ToggleField v-model="form.greeter.leaving.isEnabled" label="Leaving enabled" caption="greeter.leaving.isEnabled" />
          <ToggleField v-model="modForm.modActionLogs" label="Moderation logs" caption="mod_settings.mod_action_logs" />
          <ToggleField v-model="modForm.monitorLogs" label="Monitor logs" caption="mod_settings.monitor_logs" />
        </div>
      </SectionCard>
    </div>

    <div class="grid gap-6 xl:grid-cols-2">
      <SectionCard title="Greeting messages" description="Template hỗ trợ giữ nguyên format từ Luna.">
        <div class="grid gap-4">
          <FieldInput v-model="form.greeter.welcome.channel" label="Welcome channel ID" placeholder="123..." />
          <TextAreaField v-model="form.greeter.welcome.message" label="Welcome message" placeholder="Chào mừng {user} đến với {server}" />
          <FieldInput v-model="form.greeter.leaving.channel" label="Leaving channel ID" placeholder="123..." />
          <TextAreaField v-model="form.greeter.leaving.message" label="Leaving message" placeholder="{user} đã rời {server}" />
        </div>
      </SectionCard>

      <SectionCard title="Moderation sink" description="Kênh và cờ cho hệ thống logs.">
        <div class="grid gap-4">
          <FieldInput v-model="modForm.logChannelId" label="Log channel ID" placeholder="123..." />
          <TextAreaField
            :model-value="form.xp.exceptions.join(', ')"
            label="XP exception channel IDs"
            placeholder="123, 456"
            @update:model-value="form.xp.exceptions = $event.split(',').map((item) => item.trim()).filter(Boolean)"
          />
        </div>
      </SectionCard>
    </div>

    <button
      class="inline-flex items-center justify-center rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="saving"
      @click="save"
    >
      {{ saving ? 'Saving...' : 'Save guild settings' }}
    </button>
  </div>
</template>
