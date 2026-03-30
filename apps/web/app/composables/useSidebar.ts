const STORAGE_KEY = 'cr-sidebar-collapsed';
const BREAKPOINT = 1024;

const isCollapsed = ref(false);

export function useSidebar() {
  function init() {
    if (!import.meta.client) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    isCollapsed.value =
      stored === null ? window.innerWidth < BREAKPOINT : stored === 'true';
  }

  function toggle() {
    isCollapsed.value = !isCollapsed.value;
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed.value));
    }
  }

  return {
    isCollapsed: readonly(isCollapsed),
    toggle,
    init,
  };
}
