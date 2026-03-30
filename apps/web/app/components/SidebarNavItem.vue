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
  <UTooltip :text="label" :popper="{ placement: 'right' }">
    <NuxtLink
      :to="to"
      class="relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150"
      :class="
        isActive
          ? 'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]'
          : 'border border-transparent hover:bg-[rgba(255,255,255,0.04)]'
      "
    >
      <UIcon
        :name="icon"
        class="text-[16px]"
        :class="isActive ? 'text-[#fafafa]' : 'text-[#555] group-hover:text-[#888]'"
      />

      <!-- Running pulse -->
      <span
        v-if="isRunning"
        class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#8b5cf6] animate-pulse"
      />

      <!-- Badge -->
      <span
        v-else-if="badge && badge > 0"
        class="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-medium text-white tabular-nums"
        :style="{ background: isActive ? '#fafafa' : '#555', color: isActive ? '#0a0a0f' : '#fafafa' }"
      >
        {{ badge > 99 ? '99+' : badge }}
      </span>
    </NuxtLink>
  </UTooltip>
</template>
