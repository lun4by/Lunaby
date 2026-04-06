<script setup lang="ts">
useHead({
  bodyAttrs: {
    class: 'bg-paper text-ink',
  },
})
</script>

<template>
  <div class="min-h-screen bg-mesh-soft">
    <div class="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 lg:flex-row lg:gap-4 lg:px-6">
      <AppSidebar />
      <div class="min-h-[calc(100vh-2rem)] flex-1 overflow-hidden rounded-[32px] border border-white/60 bg-white/80 shadow-panel backdrop-blur">
        <AppTopbar />
        <main class="h-[calc(100%-72px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          <NuxtPage />
        </main>
      </div>
    </div>
  </div>
</template>
