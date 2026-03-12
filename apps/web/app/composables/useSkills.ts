export interface SkillItem {
  name: string;
  description: string;
  source: 'internal' | 'external';
  enabled: boolean;
}

const STORAGE_KEY = 'cr-enabled-skills';

/** Mode presets: which skills each mode enables by default */
const MODE_PRESETS: Record<string, string[]> = {
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
  if (typeof localStorage === 'undefined') return new Set();
  try {
    return new Set(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as string[],
    );
  } catch {
    return new Set();
  }
}

function persistEnabled(names: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...names]));
}

// Shared reactive state across all composable callers
const skills = ref<SkillItem[]>([]);
const enabledSet = ref<Set<string>>(loadEnabled());
const loaded = ref(false);

export function useSkills() {
  async function fetchSkills() {
    try {
      const data = await $fetch<
        Array<{ name: string; description: string; source: 'internal' | 'external' }>
      >('/api/skills');
      skills.value = data.map((s) => ({
        ...s,
        enabled: enabledSet.value.has(s.name),
      }));
      loaded.value = true;

      // If no saved state, apply default preset
      if (enabledSet.value.size === 0 && skills.value.length > 0) {
        const defaults = new Set(MODE_PRESETS.normal ?? []);
        enabledSet.value = defaults;
        persistEnabled(defaults);
        skills.value = skills.value.map((s) => ({
          ...s,
          enabled: defaults.has(s.name),
        }));
      }
    } catch (e) {
      console.error('Failed to load skills:', e);
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
    const preset = MODE_PRESETS[mode];
    if (!preset) return;
    const next = new Set(preset);
    enabledSet.value = next;
    persistEnabled(next);
    skills.value = skills.value.map((s) => ({
      ...s,
      enabled: next.has(s.name),
    }));
  }

  /** Names of currently enabled skills — pass to run API */
  const enabledSkillNames = computed(() => [...enabledSet.value]);

  return {
    skills,
    loaded,
    enabledSkillNames,
    fetchSkills,
    toggle,
    applyPreset,
  };
}
