<script setup lang="ts">
const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const query = ref('');
const selectedIndex = ref(0);
const inputRef = ref<HTMLInputElement>();

// Navigation items (static)
const navItems = [
  {
    label: 'Dashboard',
    icon: 'i-lucide-layout-dashboard',
    to: '/dashboard',
    group: '導航',
  },
  {
    label: 'JIRA Runner',
    icon: 'i-lucide-bug',
    to: '/jira-runner',
    group: '導航',
  },
  {
    label: 'PR Runner',
    icon: 'i-lucide-git-pull-request',
    to: '/pr-runner',
    group: '導航',
  },
  {
    label: 'Code Review',
    icon: 'i-lucide-search-code',
    to: '/pr-review',
    group: '導航',
  },
  {
    label: 'Repos',
    icon: 'i-lucide-folder-git-2',
    to: '/repos',
    group: '導航',
  },
  { label: 'Skills', icon: 'i-heroicons-cube', to: '/skills', group: '導航' },
];

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return navItems;
  return navItems.filter(
    (item) => item.label.toLowerCase().includes(q) || item.to.includes(q),
  );
});

// Reset on open
watch(
  () => props.visible,
  (v) => {
    if (v) {
      query.value = '';
      selectedIndex.value = 0;
      nextTick(() => inputRef.value?.focus());
    }
  },
);

// Clamp selected index
watch(filtered, (items) => {
  if (selectedIndex.value >= items.length) {
    selectedIndex.value = Math.max(0, items.length - 1);
  }
});

const router = useRouter();

function select(item: (typeof navItems)[0]) {
  router.push(item.to);
  emit('close');
}

function onKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault();
      selectedIndex.value = Math.min(
        selectedIndex.value + 1,
        filtered.value.length - 1,
      );

      break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);

      break;
    }
    case 'Enter': {
      e.preventDefault();
      const item = filtered.value[selectedIndex.value];
      if (item) select(item);

      break;
    }
    // No default
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
        style="background: rgb(0 0 0 / 60%); backdrop-filter: blur(4px)"
        @click.self="emit('close')"
        @keydown.esc="emit('close')"
      >
        <div
          class="w-[480px] overflow-hidden rounded-xl border"
          style="background: #0a0a12; border-color: rgb(255 255 255 / 8%)"
          @keydown="onKeydown"
        >
          <!-- Search input -->
          <div
            class="flex items-center gap-3 border-b px-4"
            style="border-color: rgb(255 255 255 / 6%)"
          >
            <UIcon name="i-lucide-search" class="shrink-0 text-[#444]" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              placeholder="搜尋頁面..."
              class="h-12 flex-1 bg-transparent text-sm text-[#fafafa] outline-none placeholder:text-[#444]"
            />
            <kbd
              class="rounded border px-1.5 py-0.5 text-[10px] text-[#444]"
              style="border-color: rgb(255 255 255 / 8%)"
              >ESC</kbd
            >
          </div>

          <!-- Results -->
          <div class="max-h-[300px] overflow-y-auto p-1">
            <div
              v-if="filtered.length === 0"
              class="px-4 py-8 text-center text-xs text-[#444]"
            >
              找不到結果
            </div>
            <template v-else>
              <button
                v-for="(item, i) in filtered"
                :key="item.to"
                class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                :class="
                  i === selectedIndex
                    ? 'bg-[rgba(255,255,255,0.06)]'
                    : 'hover:bg-[rgba(255,255,255,0.03)]'
                "
                @click="select(item)"
                @mouseenter="selectedIndex = i"
              >
                <UIcon
                  :name="item.icon"
                  class="shrink-0 text-[15px]"
                  :class="
                    i === selectedIndex ? 'text-[#fafafa]' : 'text-[#555]'
                  "
                />
                <span
                  class="text-sm"
                  :class="
                    i === selectedIndex ? 'text-[#fafafa]' : 'text-[#888]'
                  "
                >
                  {{ item.label }}
                </span>
                <span class="ml-auto text-[10px] text-[#444]">{{
                  item.to
                }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-enter-active,
.palette-leave-active {
  transition: opacity 150ms ease;
}

.palette-enter-active > div,
.palette-leave-active > div {
  transition:
    transform 150ms ease,
    opacity 150ms ease;
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}

.palette-enter-from > div {
  opacity: 0;
  transform: scale(0.95);
}

.palette-leave-to > div {
  opacity: 0;
  transform: scale(0.95);
}
</style>
