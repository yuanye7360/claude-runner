import { computed, nextTick, ref } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub localStorage for Node environment
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val;
  },
  removeItem: (key: string) => {
    Reflect.deleteProperty(store, key);
  },
  clear: () => {
    for (const k of Object.keys(store)) Reflect.deleteProperty(store, k);
  },
});

// Mock navigateTo (Nuxt auto-import)
vi.stubGlobal('navigateTo', vi.fn());

// Must reset module state between tests
let useOnboarding: typeof import('../useOnboarding').useOnboarding;

describe('useOnboarding', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    // Re-import to reset module-scoped state
    const mod = await import('../useOnboarding');
    useOnboarding = mod.useOnboarding;
  });

  function createDeps(
    overrides: {
      jira?: boolean;
      repos?: number;
      skills?: number;
    } = {},
  ) {
    const jiraConfigured = ref(overrides.jira ?? false);
    const repoCount = ref(overrides.repos ?? 0);
    const skillCount = ref(overrides.skills ?? 0);
    const openSettings = vi.fn();

    return {
      deps: {
        jiraConfigured: computed(() => jiraConfigured.value),
        repoCount: computed(() => repoCount.value),
        skillCount: computed(() => skillCount.value),
        openSettings,
      },
      jiraConfigured,
      repoCount,
      skillCount,
      openSettings,
    };
  }

  it('shows checklist when nothing is configured and not dismissed', () => {
    const { deps } = createDeps();
    const ob = useOnboarding(deps);

    expect(ob.showChecklist.value).toBe(true);
    expect(ob.completedCount.value).toBe(0);
    expect(ob.steps).toHaveLength(3);
  });

  it('marks jira step complete when jiraConfigured is true', () => {
    const { deps } = createDeps({ jira: true });
    const ob = useOnboarding(deps);

    expect(ob.steps.at(0)?.completed.value).toBe(true);
    expect(ob.completedCount.value).toBe(1);
  });

  it('marks repos step complete when repoCount > 0', () => {
    const { deps } = createDeps({ repos: 2 });
    const ob = useOnboarding(deps);

    expect(ob.steps.at(1)?.completed.value).toBe(true);
  });

  it('marks skills step complete when skillCount > 0', () => {
    const { deps } = createDeps({ skills: 3 });
    const ob = useOnboarding(deps);

    expect(ob.steps.at(2)?.completed.value).toBe(true);
  });

  it('auto-dismisses when all steps complete', async () => {
    const { deps, jiraConfigured, repoCount, skillCount } = createDeps();
    const ob = useOnboarding(deps);

    expect(ob.showChecklist.value).toBe(true);

    jiraConfigured.value = true;
    repoCount.value = 1;
    skillCount.value = 1;
    await nextTick();

    expect(ob.allCompleted.value).toBe(true);
    expect(ob.dismissed.value).toBe(true);
    expect(ob.showChecklist.value).toBe(false);
  });

  it('persists dismissed state to localStorage', async () => {
    const { deps } = createDeps();
    const ob = useOnboarding(deps);

    ob.dismiss();
    await nextTick();

    expect(localStorage.getItem('cr-onboarding-dismissed')).toBe('true');
  });

  it('restores dismissed state from localStorage', async () => {
    localStorage.setItem('cr-onboarding-dismissed', 'true');
    // Re-import to pick up localStorage
    vi.resetModules();
    const mod = await import('../useOnboarding');
    const { deps } = createDeps();
    const ob = mod.useOnboarding(deps);

    expect(ob.dismissed.value).toBe(true);
    expect(ob.showChecklist.value).toBe(false);
  });

  it('reset clears dismissed state', async () => {
    const { deps } = createDeps();
    const ob = useOnboarding(deps);

    ob.dismiss();
    await nextTick();
    expect(ob.showChecklist.value).toBe(false);

    ob.reset();
    await nextTick();
    expect(ob.dismissed.value).toBe(false);
    expect(ob.showChecklist.value).toBe(true);
    expect(localStorage.getItem('cr-onboarding-dismissed')).toBe('false');
  });

  it('calls openSettings when jira step action is triggered', () => {
    const { deps, openSettings } = createDeps();
    const ob = useOnboarding(deps);

    ob.steps.at(0)?.action();
    expect(openSettings).toHaveBeenCalled();
  });

  it('calls navigateTo /skills when skills step action is triggered', () => {
    const { deps } = createDeps();
    const ob = useOnboarding(deps);

    ob.steps.at(2)?.action();
    expect(vi.mocked(navigateTo)).toHaveBeenCalledWith('/skills');
  });
});
