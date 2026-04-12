<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: string | number | null
  label: string
  placeholder?: string
  type?: string
  readonly?: boolean
}>(), {
  modelValue: '',
  placeholder: '',
  type: 'text',
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="block">
    <span class="mb-2 block text-sm font-semibold text-stone-700">{{ label }}</span>
    <input
      :value="modelValue ?? ''"
      :type="type"
      :placeholder="placeholder"
      :readonly="readonly"
      class="dash-input"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
  </label>
</template>
