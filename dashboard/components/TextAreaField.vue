<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: string | null
  label: string
  placeholder?: string
}>(), {
  modelValue: '',
  placeholder: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="block">
    <span class="mb-2 block text-sm font-semibold text-stone-700">{{ label }}</span>
    <textarea
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      class="dash-textarea"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </label>
</template>
