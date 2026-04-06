<script setup lang="ts">
const runtimeConfig = useRuntimeConfig()
const guildId = ref(runtimeConfig.public.defaultGuildId)
const userId = ref(runtimeConfig.public.defaultUserId)

function openGuild() {
  if (!guildId.value) {
    return
  }

  navigateTo(`/guilds/${guildId.value}`)
}

function openUser() {
  if (!userId.value) {
    return
  }

  navigateTo(`/users/${userId.value}`)
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
    <SectionCard
      title="Nuxt rebuild for Luna"
      description="Dashboard mới dùng Nuxt, Pinia, Tailwind, Emotion và PostHog. Sources chính hiện đọc/ghi MariaDB cho cả guild config lẫn personalization của user."
      tone="hero"
    >
      <div class="grid gap-4 text-sm text-stone-700 sm:grid-cols-2">
        <div class="rounded-3xl border border-white/60 bg-white/70 p-5">
          <p class="font-semibold text-ink">Guild config</p>
          <p class="mt-2">`guild_settings`, `mod_settings`, `lvoice_config`, `bot_settings`, các bảng analytics liên quan.</p>
        </div>
        <div class="rounded-3xl border border-white/60 bg-white/70 p-5">
          <p class="font-semibold text-ink">User personalization</p>
          <p class="mt-2">`user_profiles.extra_data.personalInfo` và `privacy` cho occupation, custom instructions, search history, saved memories.</p>
        </div>
      </div>
    </SectionCard>

    <div class="grid gap-6">
      <SectionCard
        title="Open a guild"
        description="Nhập `guild_id` để xem overview và sửa config."
      >
        <div class="space-y-4">
          <FieldInput v-model="guildId" label="Guild ID" placeholder="123456789012345678" />
          <button
            class="inline-flex items-center justify-center rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            @click="openGuild"
          >
            Open guild dashboard
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Open a user"
        description="Nhập `user_id` để sửa dữ liệu cá nhân lưu trong MariaDB."
      >
        <div class="space-y-4">
          <FieldInput v-model="userId" label="User ID" placeholder="DM-123... hoặc guild-user composite id" />
          <button
            class="inline-flex items-center justify-center rounded-2xl bg-rose px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#ec4b6a]"
            @click="openUser"
          >
            Open user personalization
          </button>
        </div>
      </SectionCard>
    </div>
  </div>
</template>
