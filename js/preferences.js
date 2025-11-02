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
  },
  updatedAt: null
});

const readPreferences = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultPrefs();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw);
    const merged = {
      ...defaultPrefs(),
      ...parsed,
      optionalStats: {
        ...defaultPrefs().optionalStats,
        ...(parsed.optionalStats || {})
      },
      features: {
        ...defaultPrefs().features,
        ...(parsed.features || {})
      },
      updatedAt: parsed.updatedAt || null
    };
    return merged;
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
  const timestamp = new Date().toISOString();
  return updatePreferences((prefs) => ({
    ...prefs,
    optionalStats: {
      ...prefs.optionalStats,
      [id]: Boolean(enabled)
    },
    updatedAt: timestamp
  }));
};

export const setFeaturePreference = (id, enabled) => {
  const timestamp = new Date().toISOString();
  return updatePreferences((prefs) => ({
    ...prefs,
    features: {
      ...prefs.features,
      [id]: Boolean(enabled)
    },
    updatedAt: timestamp
  }));
};

export const setProjectPreference = (project) => {
  const defaultProject = createDefaultProject();
  const nextProject = {
    ...defaultProject,
    ...(project || {})
  };
  const timestamp = new Date().toISOString();
  updatePreferences((prefs) => ({
    ...prefs,
    project: nextProject,
    updatedAt: timestamp
  }));
  return nextProject;
};

export const setThemePreference = (theme) => {
  const normalized = typeof theme === 'string' ? theme : 'classic';
  const timestamp = new Date().toISOString();
  updatePreferences((prefs) => ({
    ...prefs,
    theme: normalized,
    updatedAt: timestamp
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
