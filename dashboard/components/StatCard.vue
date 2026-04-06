<script setup lang="ts">
import { useEmotionClasses } from '~/composables/useEmotionClasses'

defineProps<{
  label: string
  value: number
  hint?: string
}>()

const styles = useEmotionClasses()
</script>

<template>
  <div :class="styles.metricCard" class="rounded-[28px] border border-line p-5">
    <p class="text-xs uppercase tracking-[0.2em] text-stone-400">{{ label }}</p>
    <p class="mt-3 font-display text-4xl font-bold text-ink">{{ value.toLocaleString() }}</p>
    <p v-if="hint" class="mt-2 text-sm text-stone-600">{{ hint }}</p>
  </div>
</template>
