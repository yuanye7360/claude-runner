<script setup lang="ts">
defineProps<{
  collapsed: boolean;
  label: string;
}>();
</script>

<template>
  <div v-if="!collapsed" class="mt-4 mb-2 px-3 first:mt-0">
    <span
      class="text-[9px] font-semibold tracking-[2px] uppercase"
      style="color: rgb(139 92 246 / 60%)"
    >
      {{ label }}
    </span>
  </div>
  <div
    v-else
    class="mx-auto my-2 h-px w-6"
    style="background: rgb(139 92 246 / 10%)"
  ></div>
</template>
