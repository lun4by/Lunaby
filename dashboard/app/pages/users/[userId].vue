<script setup lang="ts">
import { storeToRefs } from 'pinia'

const route = useRoute()
const dashboardStore = useDashboardStore()
const { userPersonalization, saving, loading } = storeToRefs(dashboardStore)
const description = computed(() => `user_profiles.extra_data.personalInfo and privacy for userId: ${route.params.userId}`)

const form = reactive({
  occupation: '',
  customInstructions: '',
  allowSearchHistoryReference: true,
  allowMemoryStorage: true,
})

await useAsyncData(
  () => `user:${route.params.userId}`,
  () => dashboardStore.fetchUserPersonalization(String(route.params.userId)),
  { watch: [() => route.params.userId] },
)

watch(
  () => userPersonalization.value,
  (payload) => {
    if (!payload) {
      return
    }

    form.occupation = payload.occupation || ''
    form.customInstructions = payload.customInstructions || ''
    form.allowSearchHistoryReference = payload.allowSearchHistoryReference
    form.allowMemoryStorage = payload.allowMemoryStorage
  },
  { immediate: true },
)

async function save() {
  await dashboardStore.saveUserPersonalization(String(route.params.userId), {
    occupation: form.occupation || null,
    customInstructions: form.customInstructions || null,
    allowSearchHistoryReference: form.allowSearchHistoryReference,
    allowMemoryStorage: form.allowMemoryStorage,
  })
}
</script>

<template>
  <div class="space-y-6">
    <SectionCard
      title="User personalization"
      :description="description"
      tone="hero"
    >
      <div v-if="loading" class="text-sm text-stone-600">Loading user data...</div>
      <div v-else class="grid gap-4 md:grid-cols-2">
        <StatCard label="Search history reference" :value="form.allowSearchHistoryReference ? 1 : 0" hint="1 = enabled, 0 = disabled" />
        <StatCard label="Saved memories" :value="form.allowMemoryStorage ? 1 : 0" hint="1 = enabled, 0 = disabled" />
      </div>
    </SectionCard>

    <div class="grid gap-6 xl:grid-cols-2">
      <SectionCard title="Profile fields" description="Các field này map với command `/personalize`.">
        <div class="grid gap-4">
          <FieldInput v-model="form.occupation" label="Occupation" placeholder="Engineer, student, designer..." />
          <TextAreaField
            v-model="form.customInstructions"
            label="Custom instructions"
            placeholder="Sở thích, phong cách trả lời mong muốn..."
          />
        </div>
      </SectionCard>

      <SectionCard title="Privacy toggles" description="Hai setting được dùng trong flow personalize hiện tại.">
        <div class="grid gap-4">
          <ToggleField
            v-model="form.allowSearchHistoryReference"
            label="Reference search history"
            caption="privacy.allowSearchHistoryReference"
          />
          <ToggleField
            v-model="form.allowMemoryStorage"
            label="Reference saved memories"
            caption="privacy.allowMemoryStorage"
          />
        </div>
      </SectionCard>
    </div>

    <button
      class="inline-flex items-center justify-center rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="saving"
      @click="save"
    >
      {{ saving ? 'Saving...' : 'Save user personalization' }}
    </button>
  </div>
</template>
