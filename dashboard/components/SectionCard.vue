<script setup lang="ts">
import { useEmotionClasses } from '~/composables/useEmotionClasses'

withDefaults(defineProps<{
  title: string
  description?: string
  tone?: 'default' | 'hero'
}>(), {
  description: '',
  tone: 'default',
})

const styles = useEmotionClasses()
</script>

<template>
  <section
    class="rounded-[30px] border p-5 sm:p-6"
    :class="[
      tone === 'hero' ? styles.heroPanel : styles.glassPanel,
      tone === 'hero' ? 'border-white/70' : 'border-line bg-white/75',
    ]"
  >
    <div class="mb-5">
      <h2 class="font-display text-2xl font-bold text-ink">{{ title }}</h2>
      <p v-if="description" class="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{{ description }}</p>
    </div>
    <slot />
  </section>
</template>
