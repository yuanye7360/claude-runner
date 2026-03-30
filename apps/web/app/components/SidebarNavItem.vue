<script setup lang="ts">
const props = defineProps<{
  badge?: number;
  icon: string;
  isRunning?: boolean;
  label: string;
  to: string;
}>();

const route = useRoute();
const isActive = computed(() => route.path === props.to);
</script>

<template>
  <NuxtLink
    :to="to"
    class="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-150"
    :class="
      isActive
        ? 'bg-[rgba(255,255,255,0.06)]'
        : 'hover:bg-[rgba(255,255,255,0.04)]'
    "
  >
    <UIcon
      :name="icon"
      class="shrink-0 text-[15px]"
      :class="isActive ? 'text-[#fafafa]' : 'text-[#555] group-hover:text-[#888]'"
    />

    <span
      class="truncate text-[12px] transition-colors"
      :class="isActive ? 'font-medium text-[#fafafa]' : 'text-[#666] group-hover:text-[#888]'"
    >
      {{ label }}
    </span>

    <!-- Running pulse -->
    <span
      v-if="isRunning"
      class="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#8b5cf6]"
    ></span>

    <!-- Badge -->
    <span
      v-else-if="badge && badge > 0"
      class="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums"
      :style="{
        background: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        color: isActive ? '#fafafa' : '#888',
      }"
    >
      {{ badge > 99 ? '99+' : badge }}
    </span>
  </NuxtLink>
</template>
