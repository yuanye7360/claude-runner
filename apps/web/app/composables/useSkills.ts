export type SkillSource = 'external' | 'project';

export interface SkillItem {
  name: string;
  description: string;
  source: SkillSource;
  inject: string;
  enabled: boolean;
}

export interface SkillDetail extends Omit<SkillItem, 'enabled'> {
  content: string;
}

const STORAGE_KEY = 'cr-enabled-skills';
const PRESETS_KEY = 'cr-skill-presets';

/** Default mode presets (used as fallback) */
const DEFAULT_PRESETS: Record<string, string[]> = {
  normal: [
    'kkday-jira-branch-checkout',
    'kkday-pr-convention',
    'kkday-jira-worklog',
  ],
  smart: [
    'kkday-jira-branch-checkout',
    'kkday-pr-convention',
    'kkday-jira-worklog',
  ],
};

function loadEnabled(): Set<string> {
  if (!import.meta.client) return new Set();
  try {
    return new Set(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as string[],
    );
  } catch {
    return new Set();
  }
}

function persistEnabled(names: Set<string>) {
  if (import.meta.client)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...names]));
}

function loadPresets(): Record<string, string[]> {
  if (!import.meta.client) return { ...DEFAULT_PRESETS };
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return { ...DEFAULT_PRESETS };
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return { ...DEFAULT_PRESETS };
  }
}

function persistPresets(presets: Record<string, string[]>) {
  if (import.meta.client)
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

// Shared reactive state across all composable callers
const skills = ref<SkillItem[]>([]);
const enabledSet = ref<Set<string>>(loadEnabled());
const modePresets = ref<Record<string, string[]>>(loadPresets());
const loaded = ref(false);
export function useSkills() {
  async function fetchSkills() {
    try {
      const data = await $fetch<
        Array<{
          description: string;
          inject: string;
          name: string;
          source: SkillSource;
        }>
      >('/api/skills');
      skills.value = data.map((s) => ({
        ...s,
        enabled: enabledSet.value.has(s.name),
      }));
      loaded.value = true;

      // If no saved state, apply default preset
      if (enabledSet.value.size === 0 && skills.value.length > 0) {
        const defaults = new Set(modePresets.value.normal);
        enabledSet.value = defaults;
        persistEnabled(defaults);
        skills.value = skills.value.map((s) => ({
          ...s,
          enabled: defaults.has(s.name),
        }));
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
  }

  function toggle(name: string) {
    const next = new Set(enabledSet.value);
    next.has(name) ? next.delete(name) : next.add(name);
    enabledSet.value = next;
    persistEnabled(next);
    skills.value = skills.value.map((s) => ({
      ...s,
      enabled: next.has(s.name),
    }));
  }

  function applyPreset(mode: string) {
    const preset = modePresets.value[mode];
    if (!preset) return;
    const next = new Set(preset);
    enabledSet.value = next;
    persistEnabled(next);
    skills.value = skills.value.map((s) => ({
      ...s,
      enabled: next.has(s.name),
    }));
  }

  function updatePreset(mode: string, skillNames: string[]) {
    modePresets.value = { ...modePresets.value, [mode]: skillNames };
    persistPresets(modePresets.value);
  }

  /** Fetch a single skill's full content */
  async function fetchSkillDetail(name: string): Promise<null | SkillDetail> {
    try {
      return await $fetch<SkillDetail>(`/api/skills/${name}`);
    } catch {
      return null;
    }
  }

  /** Update a skill */
  async function updateSkill(
    name: string,
    data: { content?: string; description?: string; inject?: string },
  ) {
    await $fetch(`/api/skills/${name}`, { method: 'PUT', body: data });
    await fetchSkills();
  }

  /** Create a new skill */
  async function createSkill(data: {
    content: string;
    description: string;
    inject?: string;
    name: string;
  }) {
    await $fetch('/api/skills', { method: 'POST', body: data });
    await fetchSkills();
  }

  /** Delete a skill */
  async function deleteSkill(name: string) {
    await $fetch(`/api/skills/${name}`, { method: 'DELETE' });
    // Remove from enabled set
    const next = new Set(enabledSet.value);
    next.delete(name);
    enabledSet.value = next;
    persistEnabled(next);
    await fetchSkills();
  }

  /** Names of currently enabled skills — pass to run API */
  const enabledSkillNames = computed(() => [...enabledSet.value]);

  return {
    skills,
    loaded,
    modePresets,
    enabledSkillNames,
    fetchSkills,
    fetchSkillDetail,
    toggle,
    applyPreset,
    updatePreset,
    createSkill,
    updateSkill,
    deleteSkill,
  };
}
