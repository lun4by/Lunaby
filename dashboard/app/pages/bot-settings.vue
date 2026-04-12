<script setup lang="ts">
import { storeToRefs } from 'pinia'

const dashboardStore = useDashboardStore()
const { botSettings, saving } = storeToRefs(dashboardStore)
const editable = ref<Record<string, string>>({})
const newKey = ref('')
const newValue = ref('')

await useAsyncData('bot-settings', () => dashboardStore.fetchBotSettings())

watch(
  () => botSettings.value,
  (items) => {
    editable.value = Object.fromEntries(items.map(item => [item.key, item.value]))
  },
  { immediate: true },
)

async function saveExisting(key: string) {
  await dashboardStore.saveBotSetting({
    key,
    value: editable.value[key] || '',
    updatedBy: 'dashboard',
  })
}

async function saveNew() {
  if (!newKey.value) {
    return
  }

  await dashboardStore.saveBotSetting({
    key: newKey.value,
    value: newValue.value,
    updatedBy: 'dashboard',
  })

  newKey.value = ''
  newValue.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <SectionCard title="Bot settings" description="Các cặp `setting_key` / `setting_value` trong bảng `bot_settings`.">
      <div class="space-y-4">
        <div
          v-for="item in botSettings"
          :key="item.key"
          class="grid gap-3 rounded-3xl border border-line bg-white/70 p-4 md:grid-cols-[0.9fr_1.1fr_auto]"
        >
          <FieldInput :model-value="item.key" label="Key" readonly />
          <FieldInput v-model="editable[item.key]" label="Value" />
          <button
            class="self-end rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            :disabled="saving"
            @click="saveExisting(item.key)"
          >
            Save
          </button>
        </div>
      </div>
    </SectionCard>

    <SectionCard title="Create new setting" description="Thêm key mới hoặc upsert nếu key đã tồn tại.">
      <div class="grid gap-4 md:grid-cols-[0.8fr_1.2fr_auto]">
        <FieldInput v-model="newKey" label="New key" placeholder="dashboard_notice" />
        <FieldInput v-model="newValue" label="New value" placeholder="..." />
        <button
          class="self-end rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#ec4b6a]"
          :disabled="saving"
          @click="saveNew"
        >
          Add setting
        </button>
      </div>
    </SectionCard>
  </div>
</template>
