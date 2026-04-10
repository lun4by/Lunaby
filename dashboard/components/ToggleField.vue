<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label: string
  caption?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <label class="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white/80 px-4 py-3">
    <div>
      <p class="text-sm font-semibold text-ink">{{ label }}</p>
      <p v-if="caption" class="text-xs text-stone-500">{{ caption }}</p>
    </div>
    <input
      :checked="modelValue"
      class="dash-toggle"
      type="checkbox"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
  </label>
</template>
