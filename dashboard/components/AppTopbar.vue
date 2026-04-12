<script setup lang="ts">
const route = useRoute()

const title = computed(() => {
  if (route.path === '/') {
    return 'Dashboard bootstrap'
  }

  if (route.path === '/bot-settings') {
    return 'Bot settings'
  }

  if (route.path.startsWith('/users/')) {
    return 'User personalization'
  }

  const last = route.path.split('/').filter(Boolean).pop() || 'overview'
  return last === route.params.guildId ? 'Guild overview' : last
})
</script>

<template>
  <header class="flex h-[72px] items-center justify-between border-b border-line px-4 sm:px-6">
    <div>
      <p class="text-xs uppercase tracking-[0.24em] text-stone-400">Luna control plane</p>
      <h1 class="font-display text-2xl font-bold text-ink">{{ title }}</h1>
    </div>
    <div class="rounded-full border border-line bg-white/80 px-4 py-2 text-xs font-semibold text-stone-500">
      Nuxt + Pinia + Tailwind + Emotion + PostHog
    </div>
  </header>
</template>
