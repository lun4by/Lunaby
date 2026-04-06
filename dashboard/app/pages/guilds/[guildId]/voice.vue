<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { LVoicePayload } from '~/types/dashboard'

const route = useRoute()
const dashboardStore = useDashboardStore()
const { guildPayload, saving } = storeToRefs(dashboardStore)

const form = reactive<LVoicePayload>({
  creatorChannelId: null,
  categoryId: null,
  defaultName: '{user}',
  defaultLimit: 0,
  defaultBitrate: 64000,
})

await useAsyncData(
  () => `voice:${route.params.guildId}`,
  () => dashboardStore.fetchGuild(String(route.params.guildId)),
  { watch: [() => route.params.guildId] },
)

watch(
  () => guildPayload.value?.lvoice,
  (payload) => {
    Object.assign(
      form,
      payload
        ? structuredClone(payload)
        : {
            creatorChannelId: null,
            categoryId: null,
            defaultName: '{user}',
            defaultLimit: 0,
            defaultBitrate: 64000,
          },
    )
  },
  { immediate: true },
)

async function save() {
  await dashboardStore.saveLVoice(String(route.params.guildId), form)
}
</script>

<template>
  <div class="space-y-6">
    <SectionCard title="LVoice config" description="Bám theo command `/lvoice setup|config|disable`.">
      <div class="grid gap-4 md:grid-cols-2">
        <FieldInput v-model="form.creatorChannelId" label="Creator channel ID" placeholder="123..." />
        <FieldInput v-model="form.categoryId" label="Category ID" placeholder="123..." />
        <FieldInput v-model="form.defaultName" label="Default channel name" placeholder="{user}" />
        <FieldInput v-model="form.defaultLimit" label="User limit" type="number" placeholder="0" />
        <FieldInput v-model="form.defaultBitrate" label="Bitrate" type="number" placeholder="64000" />
      </div>
    </SectionCard>

    <div class="rounded-3xl border border-line bg-white/70 p-5 text-sm text-stone-600">
      `defaultName` nên giữ token `{user}` nếu muốn tên phòng tự chèn username. `0` ở `defaultLimit` nghĩa là không giới hạn số người.
    </div>

    <button
      class="inline-flex items-center justify-center rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="saving"
      @click="save"
    >
      {{ saving ? 'Saving...' : 'Save voice config' }}
    </button>
  </div>
</template>
