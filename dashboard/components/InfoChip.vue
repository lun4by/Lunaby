<script setup lang="ts">
defineProps<{
  label: string
  value: string
}>()
</script>

<template>
  <div class="rounded-2xl border border-line bg-white/80 p-4">
    <p class="text-xs uppercase tracking-[0.18em] text-stone-400">{{ label }}</p>
    <p class="mt-2 break-all text-sm font-semibold text-ink">{{ value }}</p>
  </div>
</template>
