<script setup lang="ts">
const props = defineProps<{
  badge?: number;
  collapsed: boolean;
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
    class="group flex items-center gap-2 transition-all duration-150"
    :class="[
      collapsed
        ? 'mx-auto w-[38px] justify-center rounded-[8px] px-0 py-2'
        : 'rounded-[10px] px-3 py-2',
      isActive
        ? 'border-l-2 border-[#8b5cf6]'
        : 'border-l-2 border-transparent hover:bg-[rgba(30,30,60,0.5)]',
    ]"
    :style="
      isActive
        ? 'background: linear-gradient(90deg, rgba(139,92,246,0.12), transparent)'
        : ''
    "
  >
    <!-- Icon -->
    <UIcon
      :name="icon"
      class="shrink-0 text-base"
      :class="
        isActive
          ? 'text-[#8b5cf6]'
          : 'text-[#4c4c6d] group-hover:text-[#c4b5fd]'
      "
    />

    <!-- Label (hidden when collapsed) -->
    <span
      v-if="!collapsed"
      class="truncate text-[12px] font-medium transition-colors"
      :class="
        isActive
          ? 'text-[#c4b5fd]'
          : 'text-[#4c4c6d] group-hover:text-[#c4b5fd]'
      "
    >
      {{ label }}
    </span>

    <!-- Running indicator -->
    <span
      v-if="isRunning"
      class="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full"
      :class="isActive ? 'neon-glow-purple bg-[#8b5cf6]' : 'bg-[#4c4c6d]'"
    ></span>

    <!-- Badge -->
    <span
      v-else-if="badge && badge > 0 && !collapsed"
      class="ml-auto rounded-full bg-[rgba(139,92,246,0.2)] px-1.5 py-0.5 text-[9px] text-[#a78bfa] tabular-nums"
    >
      {{ badge }}
    </span>

    <!-- Badge dot (collapsed mode) -->
    <span
      v-if="badge && badge > 0 && collapsed"
      class="neon-glow-purple absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-[#8b5cf6] text-[7px] text-white"
    >
      {{ badge }}
    </span>
  </NuxtLink>
</template>
