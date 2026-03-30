<script setup lang="ts">
defineProps<{
  collapsed: boolean;
  label: string;
}>();
</script>

<template>
  <div v-if="!collapsed" class="mt-4 mb-2 px-3 first:mt-0">
    <span
      class="text-[9px] font-medium tracking-[2px] uppercase"
      style="color: rgba(139, 92, 246, 0.45)"
    >
      {{ label }}
    </span>
  </div>
  <div
    v-else
    class="mx-auto my-2 h-px w-6"
    style="background: rgba(139, 92, 246, 0.1)"
  ></div>
</template>
