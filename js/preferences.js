import createDefaultProject from './project-defaults.js';

const STORAGE_KEY = 'wordtracker:v2:preferences';

const defaultPrefs = () => ({
  optionalStats: {
    averageWords: true,
    wordsRemaining: true,
    bestDay: true,
    currentStreak: true,
    projectedFinish: true,
    percentage: true
  },
  theme: 'classic',
  project: createDefaultProject(),
  features: {
    compactMode: false,
    quickAddModal: false,
    quickStatsBar: true,
    bookComparisons: true,
    devFeatures: false
  }
});

const readPreferences = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultPrefs();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw);
    return {
      ...defaultPrefs(),
      ...parsed,
      optionalStats: {
        ...defaultPrefs().optionalStats,
        ...(parsed.optionalStats || {})
      },
      features: {
        ...defaultPrefs().features,
        ...(parsed.features || {})
      }
    };
  } catch (error) {
    console.warn('Failed to parse preferences, resetting.', error);
    return defaultPrefs();
  }
};

const writePreferences = (prefs) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn('Unable to persist preferences', error);
  }
};

let cachedPrefs = readPreferences();

export const getPreferences = () => {
  cachedPrefs = readPreferences();
  return cachedPrefs;
};

export const updatePreferences = (updater) => {
  const draft = { ...cachedPrefs };
  if (typeof updater === 'function') {
    Object.assign(draft, updater({ ...draft }));
  } else if (typeof updater === 'object' && updater !== null) {
    Object.assign(draft, updater);
  }
  const defaultProject = createDefaultProject();
  cachedPrefs = {
    ...defaultPrefs(),
    ...draft,
    optionalStats: {
      ...defaultPrefs().optionalStats,
      ...(draft.optionalStats || {})
    },
    project: {
      ...defaultProject,
      ...(draft.project || {})
    },
    features: {
      ...defaultPrefs().features,
      ...(draft.features || {})
    }
  };
  writePreferences(cachedPrefs);
  return cachedPrefs;
};

export const setOptionalStatPreference = (id, enabled) => {
  const prefs = getPreferences();
  const next = {
    ...prefs,
    optionalStats: {
      ...prefs.optionalStats,
      [id]: Boolean(enabled)
    }
  };
  updatePreferences(next);
  return next;
};

export const setFeaturePreference = (id, enabled) => {
  const prefs = getPreferences();
  const next = {
    ...prefs,
    features: {
      ...prefs.features,
      [id]: Boolean(enabled)
    }
  };
  updatePreferences(next);
  return next;
};

export const setProjectPreference = (project) => {
  const defaultProject = createDefaultProject();
  const nextProject = {
    ...defaultProject,
    ...(project || {})
  };
  updatePreferences((prefs) => ({
    ...prefs,
    project: nextProject
  }));
  return nextProject;
};

export const setThemePreference = (theme) => {
  const normalized = typeof theme === 'string' ? theme : 'classic';
  updatePreferences((prefs) => ({
    ...prefs,
    theme: normalized
  }));
  return normalized;
};

export default {
  getPreferences,
  updatePreferences,
  setOptionalStatPreference,
  setFeaturePreference,
  setProjectPreference,
  setThemePreference
};
