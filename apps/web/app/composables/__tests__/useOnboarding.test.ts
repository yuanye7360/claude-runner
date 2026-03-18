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

// Capture onMounted callback so we can invoke it manually in tests
let onMountedCb: (() => void) | null = null;
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    onMounted: (cb: () => void) => {
      onMountedCb = cb;
    },
  };
});

// Must reset module state between tests
let useOnboarding: typeof import('../useOnboarding').useOnboarding;

describe('useOnboarding', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    onMountedCb = null;
    // Re-import to reset module-scoped state
    const mod = await import('../useOnboarding');
    useOnboarding = mod.useOnboarding;
  });

  function createDeps(
    overrides: {
      jira?: boolean;
      labels?: number;
      repos?: number;
      skills?: number;
    } = {},
  ) {
    const jiraConfigured = ref(overrides.jira ?? false);
    const repoCount = ref(overrides.repos ?? 0);
    const labelCount = ref(overrides.labels ?? 0);
    const skillCount = ref(overrides.skills ?? 0);

    return {
      deps: {
        jiraConfigured: computed(() => jiraConfigured.value),
        labelCount: computed(() => labelCount.value),
        repoCount: computed(() => repoCount.value),
        skillCount: computed(() => skillCount.value),
      },
      jiraConfigured,
      labelCount,
      repoCount,
      skillCount,
    };
  }

  /** Simulate mount: runs onMounted callback to hydrate dismissed from localStorage */
  function simulateMount() {
    onMountedCb?.();
  }

  it('shows checklist when nothing is configured and not dismissed', () => {
    const { deps } = createDeps();
    const ob = useOnboarding(deps);
    simulateMount();

    expect(ob.showChecklist.value).toBe(true);
    expect(ob.completedCount.value).toBe(0);
    expect(ob.steps).toHaveLength(4);
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

  it('marks labels step complete when labelCount > 0', () => {
    const { deps } = createDeps({ labels: 1 });
    const ob = useOnboarding(deps);

    expect(ob.steps.at(2)?.completed.value).toBe(true);
  });

  it('marks skills step complete when skillCount > 0', () => {
    const { deps } = createDeps({ skills: 2 });
    const ob = useOnboarding(deps);

    expect(ob.steps.at(3)?.completed.value).toBe(true);
  });

  it('auto-dismisses when all steps complete', async () => {
    const { deps, jiraConfigured, labelCount, repoCount, skillCount } =
      createDeps();
    const ob = useOnboarding(deps);
    simulateMount();

    expect(ob.showChecklist.value).toBe(true);

    jiraConfigured.value = true;
    repoCount.value = 1;
    labelCount.value = 1;
    skillCount.value = 1;
    await nextTick();

    expect(ob.allCompleted.value).toBe(true);
    expect(ob.dismissed.value).toBe(true);
    expect(ob.showChecklist.value).toBe(false);
  });

  it('dismiss sets dismissed to true', async () => {
    const { deps } = createDeps();
    const ob = useOnboarding(deps);
    simulateMount();

    ob.dismiss();
    await nextTick();

    expect(ob.dismissed.value).toBe(true);
    expect(ob.showChecklist.value).toBe(false);
  });

  it('restores dismissed state from localStorage', async () => {
    localStorage.setItem('cr-onboarding-dismissed', 'true');
    // Re-import to pick up localStorage
    vi.resetModules();
    const mod = await import('../useOnboarding');
    const { deps } = createDeps();
    const ob = mod.useOnboarding(deps);
    simulateMount();

    expect(ob.dismissed.value).toBe(true);
    expect(ob.showChecklist.value).toBe(false);
  });

  it('reset clears dismissed state', async () => {
    const { deps } = createDeps();
    const ob = useOnboarding(deps);
    simulateMount();

    ob.dismiss();
    await nextTick();
    expect(ob.showChecklist.value).toBe(false);

    ob.reset();
    await nextTick();
    expect(ob.dismissed.value).toBe(false);
    expect(ob.showChecklist.value).toBe(true);
  });
});
