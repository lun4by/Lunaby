<script setup lang="ts">
import { BarChart3, Bot, House, Settings2, Radio, UserRound } from 'lucide-vue-next'

const route = useRoute()
const activeGuildId = computed(() => String(route.params.guildId || ''))
const activeUserId = computed(() => String(route.params.userId || ''))

const guildLinks = computed(() => {
  if (!activeGuildId.value) {
    return []
  }

  return [
    { to: `/guilds/${activeGuildId.value}`, label: 'Overview', icon: House },
    { to: `/guilds/${activeGuildId.value}/analytics`, label: 'Analytics', icon: BarChart3 },
    { to: `/guilds/${activeGuildId.value}/settings`, label: 'Settings', icon: Settings2 },
    { to: `/guilds/${activeGuildId.value}/voice`, label: 'LVoice', icon: Radio },
  ]
})
</script>

<template>
  <aside class="mb-4 w-full rounded-[32px] border border-line bg-white p-4 lg:mb-0 lg:w-[300px]">
    <div class="rounded-[28px] border border-line bg-white p-5">
      <p class="font-display text-2xl font-bold text-ink">Lunaby</p>
      <p class="mt-2 text-sm text-stone-600">Nuxt dashboard dùng MariaDB làm nguồn cấu hình chính.</p>
    </div>

    <nav class="mt-6 space-y-2">
      <NuxtLink
        to="/"
        class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-ink"
        :class="{ 'bg-ink text-white hover:bg-ink hover:text-white': route.path === '/' }"
      >
        <House class="h-4 w-4" />
        Home
      </NuxtLink>

      <NuxtLink
        v-for="item in guildLinks"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-ink"
        :class="{ 'bg-ink text-white hover:bg-ink hover:text-white': route.path === item.to }"
      >
        <component :is="item.icon" class="h-4 w-4" />
        {{ item.label }}
      </NuxtLink>

      <NuxtLink
        :to="activeUserId ? `/users/${activeUserId}` : '/'"
        class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-ink"
        :class="{ 'bg-ink text-white hover:bg-ink hover:text-white': route.path.startsWith('/users/') }"
      >
        <UserRound class="h-4 w-4" />
        User Personalize
      </NuxtLink>

      <NuxtLink
        to="/bot-settings"
        class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-ink"
        :class="{ 'bg-ink text-white hover:bg-ink hover:text-white': route.path === '/bot-settings' }"
      >
        <Bot class="h-4 w-4" />
        Bot Settings
      </NuxtLink>
    </nav>
  </aside>
</template>
