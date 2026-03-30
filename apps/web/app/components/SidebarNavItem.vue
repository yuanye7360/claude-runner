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
    class="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-150"
    :class="
      isActive
        ? 'bg-[rgba(139,92,246,0.08)] border-l-2 border-[#8b5cf6]'
        : 'border-l-2 border-transparent hover:bg-[rgba(255,255,255,0.04)] hover:translate-x-0.5'
    "
  >
    <UIcon
      :name="icon"
      class="shrink-0 text-[15px] transition-colors"
      :class="isActive ? 'text-[#8b5cf6]' : 'text-[#555] group-hover:text-[#aaa]'"
    />

    <span
      class="truncate text-[12px] transition-colors"
      :class="
        isActive
          ? 'font-semibold text-[#fafafa]'
          : 'text-[#666] group-hover:text-[#ccc]'
      "
    >
      {{ label }}
    </span>

    <!-- Running pulse -->
    <span
      v-if="isRunning"
      class="glow-primary ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#8b5cf6]"
    ></span>

    <!-- Badge -->
    <span
      v-else-if="badge && badge > 0"
      class="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums"
      :style="{
        background: isActive ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
        color: isActive ? '#a78bfa' : '#888',
      }"
    >
      {{ badge > 99 ? '99+' : badge }}
    </span>
  </NuxtLink>
</template>
