import FEATURES, { isFeatureEnabled } from './config.js';
import { initWordEntry } from './word-entry.js';
import { initSidebar } from './sidebar.js';
import wordDataStore from './data-store.js';
import { getProject, updateProject } from './project-config.js';
import createDefaultProject from './project-defaults.js';
import { computeProjectMetrics, formatMetricsForDisplay, buildDailyTotals } from './stats.js';
import { initProgressSummary } from './progress-summary.js';
import { initGraph } from './graph.js';
import { initSettingsModal } from './settings-modal.js';
import { initBookComparisons, loadBooks } from './book-comparisons.js';
import initQuickAddModal from './quick-add.js';
import { initQuickStats } from './quick-stats.js';
import { getPreferences, setOptionalStatPreference, setFeaturePreference, setProjectPreference, setThemePreference, updatePreferences } from './preferences.js';
import supabase from './supabase-client.js';
import { getDateKey, startOfDay, addDays, parseDateInput, parseDateKey } from './date-utils.js';
import { buildBackupPayload, triggerBackupDownload, readBackupFile, validateBackupPayload, BACKUP_VERSION } from './data-backup.js';
import { getRewardCatalog } from './rewards-manifest.js';
import {
  evaluateTodayReward,
  getRewardsStore,
  setRewardsStore,
  setRewardForDate,
  removeRewardForDate
} from './rewards.js';
import initRewardsGallery from './rewards-gallery.js';

const selectors = {
  newLayoutRoot: '#new-layout',
  projectName: '[data-project-name]',
  dateString: '[data-current-date]',
  dayProgress: '[data-day-progress]',
  settingsTrigger: '[data-settings-trigger]',
  wordEntry: '[data-word-entry]',
  wordEntryLegacy: '[data-word-entry-legacy]',
  rewardSection: '[data-reward-section]',
  rewardCard: '[data-reward-card]',
  rewardImage: '[data-reward-image]',
  rewardEmpty: '[data-reward-empty]',
  rewardGalleryTrigger: '[data-reward-gallery-trigger]'
};

let currentProject = getProject();
const devEditButton = document.querySelector('[data-action="dev-edit"]');
let entriesEditorController = null;

const ensureHeaderDefaults = () => {
  const projectNameEl = document.querySelector(selectors.projectName);
  if (projectNameEl) {
    projectNameEl.textContent = currentProject.name || 'My Novel';
  }

  const dateStringEl = document.querySelector(selectors.dateString);
  if (dateStringEl && !dateStringEl.textContent.trim()) {
    dateStringEl.textContent = 'Nov 1, 2025';
  }

  const dayProgressEl = document.querySelector(selectors.dayProgress);
  if (dayProgressEl && !dayProgressEl.textContent.trim()) {
    dayProgressEl.textContent = 'Day 1 of 30';
  }
};

const newLayoutAPI = {
  setProjectName(name) {
    const el = document.querySelector(selectors.projectName);
    if (el) {
      el.textContent = name;
    }
  },
  setDateString(label) {
    const el = document.querySelector(selectors.dateString);
    if (el) {
      el.textContent = label;
    }
  },
  setDayProgress(label) {
    const el = document.querySelector(selectors.dayProgress);
    if (el) {
      el.textContent = label;
    }
  },
  getSettingsTrigger() {
    return document.querySelector(selectors.settingsTrigger);
  }
};

let sidebarController = null;
let wordEntryController = null;
let dataListenersRegistered = false;
let progressSummaryController = null;
let graphController = null;
let settingsModalController = null;
let latestMetrics = null;
let latestRewards = [];
let bookComparisonsController = null;
let booksData = [];
let quickStatsController = null;
let quickAddModalController = null;
let rewardsGalleryController = null;
let rewardsAdminController = null;
const rewardsAdminState = {
  editingDate: null
};
let currentRewardToday = null;
let currentImageModalReward = null;
let remotePreferencesSupportsTheme = true;

const preferenceCache = getPreferences();
const rewardCatalog = getRewardCatalog();
const rewardCatalogMap = new Map(rewardCatalog.map((entry) => [entry.id, entry]));
const rewardDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const defaultOptionalStats = {
  averageWords: true,
  wordsRemaining: true,
  bestDay: true,
  currentStreak: true,
  projectedFinish: true,
  percentage: true
};

const defaultFeaturePrefs = {
  compactMode: false,
  quickAddModal: false,
  quickStatsBar: true,
  rewardsSystem: true,
  bookComparisons: true,
  devFeatures: false
};

const optionalStatIds = { ...defaultOptionalStats };
Object.keys(optionalStatIds).forEach((key) => {
  if (preferenceCache.optionalStats && Object.prototype.hasOwnProperty.call(preferenceCache.optionalStats, key)) {
    optionalStatIds[key] = preferenceCache.optionalStats[key] !== false;
  }
});

const featurePreferences = { ...defaultFeaturePrefs };
Object.keys(featurePreferences).forEach((key) => {
  if (preferenceCache.features && Object.prototype.hasOwnProperty.call(preferenceCache.features, key)) {
    featurePreferences[key] = preferenceCache.features[key] !== false;
  }
});

const THEMES = Object.freeze(['classic', 'emerald', 'midnight', 'twilight', 'sunset', 'wicked']);
let currentTheme = THEMES.includes(preferenceCache.theme) ? preferenceCache.theme : 'classic';
if (!THEMES.includes(preferenceCache.theme)) {
  setThemePreference(currentTheme);
}

const applyThemeClass = (themeId) => {
  const body = document.body;
  if (!body) return;
  const targetClass = `theme-${themeId}`;
  Array.from(body.classList).forEach((cls) => {
    if (cls.startsWith('theme-')) {
      body.classList.remove(cls);
    }
  });
  body.classList.add(targetClass);
};

applyThemeClass(currentTheme);

const updateTheme = (themeId, { persistLocal = true, persistRemote = true } = {}) => {
  const normalized = THEMES.includes(themeId) ? themeId : 'classic';
  if (currentTheme === normalized && document.body?.classList.contains(`theme-${normalized}`)) {
    return;
  }
  currentTheme = normalized;
  applyThemeClass(normalized);
  if (persistLocal) {
    setThemePreference(normalized);
  }
  if (settingsModalController) {
    settingsModalController.setTheme(normalized);
  }
  if (authUser && persistRemote) {
    persistPreferences();
  }
};

const baseWordStore = {
  addWords: wordDataStore.addWords.bind(wordDataStore),
  setTotal: wordDataStore.setTotal.bind(wordDataStore),
  undoLastEntry: wordDataStore.undoLastEntry.bind(wordDataStore),
  replaceState: wordDataStore.replaceState.bind(wordDataStore),
  reset: wordDataStore.reset.bind(wordDataStore)
};

let authUser = null;

const appRoot = document.getElementById('app');
const authOverlay = document.querySelector('[data-auth-overlay]');
const authForm = authOverlay?.querySelector('[data-auth-form]') || null;
const authEmailInput = authOverlay?.querySelector('[data-auth-email]') || null;
const authFeedback = authOverlay?.querySelector('[data-auth-feedback]') || null;
const authSubmitButton = authForm?.querySelector('button[type="submit"]') || null;
const authUserLabel = document.querySelector('[data-auth-user]');
const logoutButton = document.querySelector('[data-auth-logout]');
const exportButton = document.querySelector('[data-action="export"]');
const importButton = document.querySelector('[data-action="import"]');
const resetButton = document.querySelector('[data-action="reset"]');
const importInput = document.querySelector('[data-import-input]');
const rewardSection = document.querySelector(selectors.rewardSection);
const rewardCard = document.querySelector(selectors.rewardCard);
const rewardImage = document.querySelector(selectors.rewardImage);
const rewardEmptyState = document.querySelector(selectors.rewardEmpty);
const rewardGalleryTrigger = document.querySelector(selectors.rewardGalleryTrigger);
const rewardsGalleryModal = document.querySelector('[data-reward-gallery-modal]');
const rewardImageTrigger = document.querySelector('[data-reward-image-trigger]');
const rewardManageButton = document.querySelector('[data-action="manage-rewards"]');
const rewardsAdminModal = document.querySelector('[data-rewards-admin-modal]');
const rewardsAdminForm = rewardsAdminModal?.querySelector('[data-rewards-admin-form]') || null;
const rewardsAdminDateInput = rewardsAdminModal?.querySelector('[data-admin-reward-date]') || null;
const rewardsAdminSelect = rewardsAdminModal?.querySelector('[data-admin-reward-select]') || null;
const rewardsAdminMessageInput = rewardsAdminModal?.querySelector('[data-admin-reward-message]') || null;
const rewardsAdminDefaultButton = rewardsAdminModal?.querySelector('[data-admin-reward-default]') || null;
const rewardsAdminList = rewardsAdminModal?.querySelector('[data-rewards-admin-list]') || null;
const rewardsAdminEmptyState = rewardsAdminModal?.querySelector('[data-rewards-admin-empty]') || null;
const rewardsAdminDismissButtons = Array.from(rewardsAdminModal?.querySelectorAll('[data-rewards-admin-dismiss]') || []);
const imageModal = document.querySelector('[data-image-modal]');
const imageModalTitle = imageModal?.querySelector('[data-image-modal-title]') || null;
const imageModalPicture = imageModal?.querySelector('[data-image-modal-picture]') || null;
const imageModalCaption = imageModal?.querySelector('[data-image-modal-caption]') || null;
const imageModalDismissButtons = Array.from(imageModal?.querySelectorAll('[data-image-modal-dismiss]') || []);
const quickAddTriggers = Array.from(document.querySelectorAll('[data-quick-add-trigger]'));
const quickAddModalRoot = document.querySelector('[data-quick-add-modal]');
const quickAddDismissButtons = Array.from(quickAddModalRoot?.querySelectorAll('[data-quick-add-dismiss]') || []);
const quickAddInput = quickAddModalRoot?.querySelector('[data-quick-add-input]') || null;
const quickAddSubmitButton = quickAddModalRoot?.querySelector('[data-quick-add-submit]') || null;
const quickAddErrorField = quickAddModalRoot?.querySelector('[data-quick-add-error]') || null;
const quickAddForm = quickAddModalRoot?.querySelector('[data-quick-add-form]') || null;
const quickAddModeSelect = quickAddModalRoot?.querySelector('[data-quick-add-mode]') || null;

if (devEditButton) {
  devEditButton.hidden = true;
}

const isOptionalStatEnabled = (id) => optionalStatIds[id] !== false;

const setOptionalStatEnabled = (id, enabled, options = {}) => {
  const { syncLocal = true, syncRemote = true } = options;
  if (Object.prototype.hasOwnProperty.call(optionalStatIds, id)) {
    optionalStatIds[id] = Boolean(enabled);
    if (syncLocal) {
      setOptionalStatPreference(id, enabled);
    }
    if (authUser && syncRemote) {
      persistPreferences();
    }
  }
};

const isFeatureEnabledForUser = (id) => featurePreferences[id] !== false;

const setFeatureEnabled = (id, enabled, options = {}) => {
  const { syncLocal = true, syncRemote = true } = options;
  if (!Object.prototype.hasOwnProperty.call(featurePreferences, id)) return;
  featurePreferences[id] = Boolean(enabled);
  if (syncLocal) {
    setFeaturePreference(id, enabled);
  }

  if (id === 'bookComparisons') {
    if (enabled && isFeatureEnabled('bookComparisons')) {
      enableBookComparisons();
    } else {
      disableBookComparisons();
    }
  }

  if (id === 'rewardsSystem') {
    if (enabled && isFeatureEnabled('rewardsSystem')) {
      enableRewardsSystem();
    } else {
      disableRewardsSystem();
    }
  }

  if (id === 'devFeatures') {
    toggleDevToolsVisibility(enabled);
    if (!enabled && entriesEditorController) {
      entriesEditorController.close();
    }
  }

  if (id === 'compactMode') {
    applyCompactMode(enabled);
  }

  if (id === 'quickStatsBar') {
    if (enabled && isFeatureEnabled('quickStatsBar')) {
      enableQuickStatsBar();
    } else {
      disableQuickStatsBar();
    }
  }

  if (id === 'quickAddModal') {
    if (enabled && isFeatureEnabled('quickAddModal')) {
      enableQuickAddModalMode();
    } else {
      disableQuickAddModalMode();
    }
  }

  updateProjectMetrics();
  if (authUser && syncRemote) {
    persistPreferences();
  }
};

const getProgressSummaryAPI = () => ({
  setProgress(payload) {
    if (progressSummaryController) {
      progressSummaryController.setProgress(payload);
    }
  }
});

const getGraphAPI = () => ({
  update(payload) {
    if (graphController) {
      graphController.update(payload);
    }
  }
});

const getSettingsAPI = () => ({
  open() {
    if (settingsModalController) {
      settingsModalController.open();
    }
  },
  setStatEnabled(id, enabled) {
    setOptionalStatEnabled(id, enabled);
    if (settingsModalController) {
      settingsModalController.setStatToggle(id, enabled);
    }
    updateProjectMetrics();
  },
  getSelections() {
    return { ...optionalStatIds };
  },
  setFeatureEnabled(id, enabled) {
    setFeatureEnabled(id, enabled);
    if (settingsModalController) {
      settingsModalController.setFeatureToggle(id, enabled);
    }
  },
  getFeatureSelections() {
    return { ...featurePreferences };
  },
  setTheme(theme) {
    updateTheme(theme);
  },
  getTheme() {
    return currentTheme;
  }
});

const getSidebarAPI = () => ({
  setStat(id, payload) {
    if (sidebarController) {
      sidebarController.setStat(id, payload);
    }
  },
  reset() {
    if (sidebarController) {
      sidebarController.resetStats();
    }
  },
  getRoot() {
    return sidebarController ? sidebarController.getRoot() : null;
  },
  setVisibility(map) {
    if (!sidebarController) return;
    Object.entries(map || {}).forEach(([id, enabled]) => {
      sidebarController.setStat(id, { hidden: !enabled });
    });
  }
});

const getWordEntryAPI = () => ({
  setStatus(message) {
    if (wordEntryController) {
      wordEntryController.updateStatus(message);
    }
  },
  focusInput() {
    if (wordEntryController) {
      wordEntryController.focusInput();
    }
  },
  setTotalWords(total) {
    if (wordEntryController) {
      wordEntryController.setTotalWords(total);
      refreshQuickAddSetValue();
    }
  },
  getState() {
    return wordEntryController ? wordEntryController.getState() : null;
  },
  setMode(mode, options) {
    if (wordEntryController) {
      wordEntryController.setMode(mode, options);
    }
  },
  getMode() {
    return wordEntryController ? wordEntryController.getMode() : 'add';
  }
});

const getCurrentTotalWords = () => {
  const snapshot = typeof wordDataStore.getSnapshot === 'function' ? wordDataStore.getSnapshot() : null;
  const storeTotal = snapshot && Number.isFinite(snapshot.total) ? snapshot.total : null;
  if (Number.isFinite(storeTotal)) {
    return Math.max(0, Math.round(storeTotal));
  }
  const controllerTotal =
    wordEntryController && typeof wordEntryController.getTotalWords === 'function'
      ? wordEntryController.getTotalWords()
      : null;
  return Math.max(0, Number.isFinite(controllerTotal) ? Math.round(controllerTotal) : 0);
};

const refreshQuickAddSetValue = () => {
  if (!quickAddInput || !quickAddModeSelect || quickAddModeSelect.value !== 'set') {
    return;
  }
  quickAddInput.value = String(getCurrentTotalWords());
};

const sanitizeProjectFromBackup = (project = {}) => {
  const fallback = createDefaultProject();
  const sanitizeDate = (value) => {
    if (!value) return fallback.startDate;
    const parsed = parseDateInput(value);
    return parsed ? getDateKey(parsed) : fallback.startDate;
  };
  return {
    id: typeof project.id === 'string' && project.id ? project.id : undefined,
    name: typeof project.name === 'string' && project.name.trim() ? project.name.trim() : fallback.name,
    goal: Number.isFinite(Number(project.goal)) && Number(project.goal) > 0 ? Math.round(Number(project.goal)) : fallback.goal,
    startDate: sanitizeDate(project.startDate || project.start_date || fallback.startDate),
    endDate: sanitizeDate(project.endDate || project.end_date || fallback.endDate)
  };
};

const sanitizeEntriesFromBackup = (entries = []) => {
  if (!Array.isArray(entries) || !entries.length) {
    return [];
  }
  const sorted = entries
    .map((entry, index) => {
      const timestamp = (() => {
        const value = entry?.timestamp ?? entry?.date;
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : null;
        }
        if (typeof value === 'string') {
          const parsed = Date.parse(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      })();
      if (!Number.isFinite(timestamp)) {
        return null;
      }
      const delta = Number(entry?.delta ?? entry?.value ?? 0);
      if (!Number.isFinite(delta)) {
        return null;
      }
      return {
        timestamp,
        delta,
        id: typeof entry?.id === 'string' && entry.id ? entry.id : `import-${timestamp}-${index}`
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);

  let cumulative = 0;
  const sanitized = sorted.map((entry) => {
    const previousTotal = Math.max(cumulative, 0);
    const delta = entry.delta;
    const rawNewTotal = previousTotal + delta;
    const newTotal = Math.max(rawNewTotal, 0);
    cumulative = newTotal;
    return {
      id: entry.id,
      mode: 'add',
      delta,
      previousTotal,
      newTotal,
      timestamp: entry.timestamp
    };
  });

  return sanitized;
};

const sanitizePreferencesFromBackup = (preferences = {}) => {
  const optional = typeof preferences.optionalStats === 'object' && preferences.optionalStats !== null
    ? preferences.optionalStats
    : {};
  const features = typeof preferences.features === 'object' && preferences.features !== null
    ? preferences.features
    : {};
  const theme = typeof preferences.theme === 'string' ? preferences.theme : 'classic';
  return { optionalStats: optional, features, theme };
};

const collectBackupPayload = () => {
  const snapshot = wordDataStore.getSnapshot();
  const sortedEntries = [...(snapshot.entries || [])]
    .map((entry) => ({
      id: entry.id,
      mode: entry.mode,
      delta: entry.delta,
      previousTotal: entry.previousTotal,
      newTotal: entry.newTotal,
      timestamp: entry.timestamp
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const projectPayload = {
    id: currentProject.id,
    name: currentProject.name,
    goal: currentProject.goal,
    startDate: currentProject.startDate,
    endDate: currentProject.endDate
  };

  const preferencesPayload = {
    optionalStats: { ...optionalStatIds },
    features: { ...featurePreferences },
    theme: currentTheme
  };

  const rewardsPayload = getRewardsStore();

  return buildBackupPayload({
    project: projectPayload,
    entries: sortedEntries,
    preferences: preferencesPayload,
    rewards: rewardsPayload
  });
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const syncRewardsCollectionToSupabase = async () => {
  return;
};

const syncBackupToSupabase = async (projectPayload, entries) => {
  if (!supabase || !authUser) {
    return;
  }
  const projectId = projectPayload?.id || currentProject?.id;
  if (!projectId) {
    return;
  }

  try {
    await supabase
      .from('projects')
      .upsert({
        id: projectId,
        user_id: authUser.id,
        name: projectPayload.name,
        goal: projectPayload.goal,
        start_date: projectPayload.startDate,
        end_date: projectPayload.endDate,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    await supabase
      .from('entries')
      .delete()
      .eq('project_id', projectId);

    if (entries.length) {
      const rows = entries
        .map((entry) => {
          const entryDate = getDateKey(entry.timestamp);
          return entryDate
            ? { project_id: projectId, entry_date: entryDate, delta: entry.delta }
            : null;
        })
        .filter(Boolean);

      const grouped = rows.reduce((acc, row) => {
        const existing = acc.get(row.entry_date) || 0;
        acc.set(row.entry_date, existing + row.delta);
        return acc;
      }, new Map());

      const aggregatedRows = Array.from(grouped.entries()).map(([entryDate, delta]) => ({
        project_id: projectId,
        entry_date: entryDate,
        delta
      }));

      const chunks = chunkArray(aggregatedRows, 500);
      for (const chunk of chunks) {
        if (!chunk.length) continue;
        const { error } = await supabase.from('entries').insert(chunk);
        if (error) {
          throw error;
        }
      }
    }

    await syncRewardsCollectionToSupabase();
    await persistPreferences();
  } catch (error) {
    console.error('Unable to sync backup to Supabase.', error);
    throw error;
  }
};

const handleExportData = async () => {
  try {
    if (exportButton) {
      exportButton.disabled = true;
    }
    if (supabase && authUser) {
      await refreshEntriesFromSupabase();
      await refreshRewardsFromSupabase();
    }
    const payload = collectBackupPayload();
    const timestamp = new Date();
    const filename = `wordtracker-backup-${getDateKey(timestamp)}.json`;
    triggerBackupDownload(payload, filename);
    window.alert('Backup exported successfully.');
  } catch (error) {
    console.error('Unable to export data.', error);
    window.alert('Unable to export data. Please try again.');
  } finally {
    if (exportButton) {
      exportButton.disabled = false;
    }
  }
};

const applyBackupPayload = async (backup) => {
  const sanitizedProject = sanitizeProjectFromBackup(backup.project);
  const sanitizedEntries = sanitizeEntriesFromBackup(backup.entries);
  const sanitizedPreferences = sanitizePreferencesFromBackup(backup.preferences);

  const desiredProject = {
    id: currentProject?.id || sanitizedProject.id || createDefaultProject().id,
    name: sanitizedProject.name,
    goal: sanitizedProject.goal,
    startDate: sanitizedProject.startDate,
    endDate: sanitizedProject.endDate
  };

  currentProject = updateProject(desiredProject);
  setProjectPreference(currentProject);
  ensureHeaderDefaults();

  wordDataStore.replaceState({
    total: sanitizedEntries.length ? sanitizedEntries[sanitizedEntries.length - 1].newTotal : 0,
    entries: sanitizedEntries
  });

  Object.keys(defaultOptionalStats).forEach((id) => {
    const enabled = Object.prototype.hasOwnProperty.call(sanitizedPreferences.optionalStats, id)
      ? sanitizedPreferences.optionalStats[id] !== false
      : defaultOptionalStats[id];
    setOptionalStatEnabled(id, enabled, { syncLocal: true, syncRemote: false });
  });

  Object.keys(defaultFeaturePrefs).forEach((id) => {
    const enabled = Object.prototype.hasOwnProperty.call(sanitizedPreferences.features, id)
      ? sanitizedPreferences.features[id] !== false
      : defaultFeaturePrefs[id];
    setFeatureEnabled(id, enabled, { syncLocal: true, syncRemote: false });
  });

  updateTheme(sanitizedPreferences.theme, { persistLocal: true, persistRemote: false });

  const importedRewardsStore =
    typeof backup.rewards === 'object' && backup.rewards !== null ? backup.rewards : {};
  const aggregatedRewards = [];
  Object.entries(importedRewardsStore).forEach(([, projectRewards]) => {
    if (!projectRewards || typeof projectRewards !== 'object') return;
    Object.entries(projectRewards).forEach(([dateKey, reward]) => {
      if (!reward || typeof reward !== 'object') return;
      aggregatedRewards.push({
        ...reward,
        date: dateKey
      });
    });
  });

  const nextRewardsStore = {};
  if (currentProject.id) {
    const projectRewards = {};
    aggregatedRewards.forEach((reward) => {
      if (!reward?.date) return;
      const { date, ...details } = reward;
      projectRewards[date] = details;
    });
    if (Object.keys(projectRewards).length) {
      nextRewardsStore[currentProject.id] = projectRewards;
    }
  }

  setRewardsStore(nextRewardsStore);

  applyFeatureFlags();
  updateProjectMetrics();
  ensureHeaderDefaults();

  if (supabase && authUser) {
    await syncBackupToSupabase(currentProject, sanitizedEntries);
    await refreshEntriesFromSupabase();
    await refreshRewardsFromSupabase();
  }

  if (authUser) {
    await persistPreferences();
  }
};

const handleImportFileSelection = async (event) => {
  const file = event.target.files?.[0] || null;
  event.target.value = '';
  if (!file) {
    return;
  }

  try {
    const data = await readBackupFile(file);
    const { valid, errors } = validateBackupPayload(data);
    if (!valid) {
      window.alert(`Unable to import backup:\n${errors.join('\n')}`);
      return;
    }

    if (data.metadata?.version && data.metadata.version !== BACKUP_VERSION) {
      const proceed = window.confirm(`This backup was created with version ${data.metadata.version}, which differs from the current format (${BACKUP_VERSION}). Continue with import?`);
      if (!proceed) {
        return;
      }
    }

    const warning = 'Importing data will overwrite your current progress. Make sure you exported a backup first. Continue?';
    if (!window.confirm(warning)) {
      return;
    }

    await applyBackupPayload(data);
    window.alert('Backup imported successfully.');
  } catch (error) {
    console.error('Unable to import data.', error);
    window.alert('Unable to import data. Please verify the file and try again.');
  }
};

const performFullReset = async () => {
  wordDataStore.replaceState({ total: 0, entries: [] });
  wordDataStore.reset();
  setRewardsStore({});

  Object.entries(defaultOptionalStats).forEach(([id, enabled]) => {
    setOptionalStatEnabled(id, enabled, { syncLocal: true, syncRemote: false });
  });
  Object.entries(defaultFeaturePrefs).forEach(([id, enabled]) => {
    setFeatureEnabled(id, enabled, { syncLocal: true, syncRemote: false });
  });

  const defaults = createDefaultProject();
  const nextProject = {
    id: currentProject?.id || defaults.id,
    name: defaults.name,
    goal: defaults.goal,
    startDate: defaults.startDate,
    endDate: defaults.endDate
  };
  currentProject = updateProject(nextProject);
  setProjectPreference(currentProject);
  ensureHeaderDefaults();

  updateTheme('classic', { persistLocal: true, persistRemote: false });

  applyFeatureFlags();
  updateProjectMetrics();

  if (supabase && authUser && currentProject?.id) {
    try {
      await supabase.from('entries').delete().eq('project_id', currentProject.id);
      await supabase
        .from('projects')
        .upsert({
          id: currentProject.id,
          user_id: authUser.id,
          name: currentProject.name,
          goal: currentProject.goal,
          start_date: currentProject.startDate,
          end_date: currentProject.endDate,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      await supabase.from('preferences').delete().eq('user_id', authUser.id);
    } catch (error) {
      console.error('Unable to reset Supabase data.', error);
      throw error;
    }
  }

  if (authUser) {
    await persistPreferences();
  }
};

const handleResetAllData = async () => {
  const warning = 'Resetting will permanently delete your progress. Export a backup before continuing.';
  if (!window.confirm(warning)) {
    return;
  }
  const confirmation = window.prompt('Type RESET to confirm you want to delete all data.');
  if (!confirmation || confirmation.trim().toUpperCase() !== 'RESET') {
    return;
  }
  try {
    await performFullReset();
    window.alert('All data has been reset.');
  } catch (error) {
    console.error('Unable to reset data.', error);
    window.alert('Unable to reset data completely. Please try again.');
  }
};

const setupDataManagementControls = () => {
  if (exportButton) {
    exportButton.disabled = false;
    exportButton.addEventListener('click', handleExportData);
  }
  if (importButton && importInput) {
    importButton.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', handleImportFileSelection);
  }
  if (resetButton) {
    resetButton.addEventListener('click', handleResetAllData);
  }
  if (rewardGalleryTrigger) {
    rewardGalleryTrigger.addEventListener('click', (event) => {
      event.preventDefault();
      openRewardsGallery();
    });
  }
  if (rewardManageButton) {
    rewardManageButton.addEventListener('click', (event) => {
      event.preventDefault();
      openRewardsAdmin();
    });
  }
  if (rewardsAdminForm) {
    rewardsAdminForm.addEventListener('submit', handleRewardsAdminSubmit);
  }
  if (rewardsAdminDefaultButton) {
    rewardsAdminDefaultButton.addEventListener('click', handleRewardsAdminDefault);
  }
  if (rewardsAdminSelect) {
    rewardsAdminSelect.addEventListener('change', () => {
      if (!rewardsAdminMessageInput) return;
      if (rewardsAdminMessageInput.value.trim()) return;
      const entry = getManifestForId(rewardsAdminSelect.value);
      rewardsAdminMessageInput.value = entry?.message || '';
    });
  }
  if (rewardsAdminList) {
    rewardsAdminList.addEventListener('click', handleRewardsAdminListClick);
  }
  rewardsAdminDismissButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      closeRewardsAdmin();
    });
  });
  imageModalDismissButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      closeImageModal();
    });
  });
  if (rewardImageTrigger) {
    rewardImageTrigger.addEventListener('click', (event) => {
      event.preventDefault();
      if (currentRewardToday && currentRewardToday.image) {
        openImageModal(currentRewardToday);
      }
    });
    rewardImageTrigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        if (currentRewardToday && currentRewardToday.image) {
          event.preventDefault();
          openImageModal(currentRewardToday);
        }
      }
    });
  }
  populateRewardsAdminSelect();
};

const updateProjectMetrics = () => {
  const snapshot = wordDataStore.getSnapshot();
  const metrics = computeProjectMetrics(snapshot, currentProject, new Date());
  const formatted = formatMetricsForDisplay(metrics);
  latestMetrics = metrics;

  if (quickStatsController) {
    quickStatsController.update(metrics);
  }

  if (sidebarController) {
    sidebarController.setStat('totalWords', { value: formatted.totalWords });
    sidebarController.setStat('wordsToday', {
      value: metrics.highlightToday ? `${formatted.wordsToday} ✓` : formatted.wordsToday,
      emphasize: metrics.highlightToday
    });
    sidebarController.setStat('wordsPerDay', { value: formatted.wordsPerDayRequired });
    sidebarController.setStat('percentage', {
      value: formatted.percentage,
      hidden: !isOptionalStatEnabled('percentage')
    });
    sidebarController.setStat('averageWords', {
      value: formatted.averageWordsPerDay,
      hidden: !isOptionalStatEnabled('averageWords') || formatted.averageWordsPerDay === '—'
    });
    sidebarController.setStat('wordsRemaining', {
      value: formatted.wordsRemaining,
      hidden: !isOptionalStatEnabled('wordsRemaining')
    });
    sidebarController.setStat('bestDay', {
      value: formatted.bestDay,
      hidden: !isOptionalStatEnabled('bestDay') || formatted.bestDay === '—'
    });
    sidebarController.setStat('currentStreak', {
      value: formatted.currentStreak,
      emphasize: metrics.currentStreak > 0,
      hidden: !isOptionalStatEnabled('currentStreak')
    });
    sidebarController.setStat('projectedFinish', {
      value: formatted.projectedFinish,
      hidden: !isOptionalStatEnabled('projectedFinish') || formatted.projectedFinish === '—'
    });
  }

  if (progressSummaryController && isFeatureEnabled('newProgressSummary')) {
    progressSummaryController.setProgress({
      percentage: formatted.percentage,
      wordsLabel: formatted.progressWordsLabel,
      paceLabel: formatted.paceLabel,
      paceState: metrics.paceState
    });
  }

  if (graphController) {
    graphController.update({ snapshot, project: currentProject });
  }

  updateRewardsUI(metrics);
  updateBookComparisons(metrics);

  if (window.wordTrackerUI && window.wordTrackerUI.newLayout) {
    window.wordTrackerUI.newLayout.setDateString(metrics.dateString);
    window.wordTrackerUI.newLayout.setDayProgress(metrics.headerLabel);
  }
};

const enableNewWordEntry = () => {
  const newWordEntry = document.querySelector(selectors.wordEntry);
  const legacyWordEntry = document.querySelector(selectors.wordEntryLegacy);

  if (newWordEntry) {
    newWordEntry.removeAttribute('hidden');
  }
  if (legacyWordEntry) {
    legacyWordEntry.setAttribute('hidden', '');
  }

  if (!wordEntryController) {
    wordEntryController = initWordEntry();
  }

  window.wordTrackerUI = window.wordTrackerUI || {};
  window.wordTrackerUI.wordEntry = Object.freeze(getWordEntryAPI());

  if (featurePreferences.quickAddModal && isFeatureEnabled('quickAddModal')) {
    enableQuickAddModalMode();
  }

  updateProjectMetrics();
};

const disableNewWordEntry = () => {
  const newWordEntry = document.querySelector(selectors.wordEntry);
  const legacyWordEntry = document.querySelector(selectors.wordEntryLegacy);

  if (newWordEntry) {
    newWordEntry.setAttribute('hidden', '');
  }
  if (legacyWordEntry) {
    legacyWordEntry.removeAttribute('hidden');
  }

  if (wordEntryController) {
    wordEntryController.destroy();
    wordEntryController = null;
  }

  disableQuickAddModalMode();

  if (window.wordTrackerUI && window.wordTrackerUI.wordEntry) {
    delete window.wordTrackerUI.wordEntry;
  }
};

const enableSidebar = () => {
  if (!sidebarController) {
    sidebarController = initSidebar();
  }

  if (sidebarController) {
    window.wordTrackerUI = window.wordTrackerUI || {};
    window.wordTrackerUI.sidebar = Object.freeze(getSidebarAPI());
  }
};

const disableSidebar = () => {
  sidebarController = null;

  if (window.wordTrackerUI && window.wordTrackerUI.sidebar) {
    delete window.wordTrackerUI.sidebar;
  }
};

const enableProgressSummary = () => {
  if (!progressSummaryController) {
    progressSummaryController = initProgressSummary();
  }

  if (progressSummaryController) {
    window.wordTrackerUI = window.wordTrackerUI || {};
    window.wordTrackerUI.progressSummary = Object.freeze(getProgressSummaryAPI());
  }
};

const disableProgressSummary = () => {
  progressSummaryController = null;
  if (window.wordTrackerUI && window.wordTrackerUI.progressSummary) {
    delete window.wordTrackerUI.progressSummary;
  }
};

const enableGraph = () => {
  if (!graphController) {
    graphController = initGraph();
  }

  if (graphController) {
    window.wordTrackerUI = window.wordTrackerUI || {};
    window.wordTrackerUI.graph = Object.freeze(getGraphAPI());
  }
};

const disableGraph = () => {
  if (graphController) {
    graphController.destroy();
    graphController = null;
  }
  if (window.wordTrackerUI && window.wordTrackerUI.graph) {
    delete window.wordTrackerUI.graph;
  }
};

const ensureRewardsGalleryController = () => {
  if (!rewardsGalleryModal) return;
  if (!rewardsGalleryController) {
    rewardsGalleryController = initRewardsGallery();
  }
  if (rewardsGalleryController && rewardGalleryTrigger) {
    if (typeof rewardsGalleryController.registerTrigger === 'function') {
      rewardsGalleryController.registerTrigger(rewardGalleryTrigger);
    }
    if (typeof rewardsGalleryController.refreshTriggers === 'function') {
      rewardsGalleryController.refreshTriggers();
    }
  }
};

const openRewardsGallery = () => {
  ensureRewardsGalleryController();
  attachGalleryPreviewHandlers();
  rewardsGalleryController?.open();
};

const handleImageModalKeydown = (event) => {
  if (event.key === 'Escape') {
    closeImageModal();
  }
};

const resolveRewardDisplayDate = (reward) => {
  if (!reward) return null;
  if (reward.date) {
    const parsedKey = parseDateKey(reward.date);
    if (parsedKey) return parsedKey;
    const parsedDate = parseDateInput(reward.date);
    if (parsedDate) {
      const normalized = startOfDay(parsedDate);
      if (normalized) return normalized;
    }
  }
  if (reward.unlockedAt) {
    const parsedUnlocked = parseDateInput(reward.unlockedAt);
    if (parsedUnlocked) {
      const normalized = startOfDay(parsedUnlocked);
      if (normalized) return normalized;
    }
  }
  return null;
};

const openImageModal = (reward) => {
  if (!imageModal || !reward || !reward.image) {
    return;
  }
  currentImageModalReward = reward;
  if (imageModalPicture) {
    imageModalPicture.src = reward.image;
    imageModalPicture.alt = reward.label || reward.name || 'Reward image';
  }
  if (imageModalTitle) {
    imageModalTitle.textContent = reward.label || reward.name || 'Reward preview';
  }
  if (imageModalCaption) {
    const displayDate = resolveRewardDisplayDate(reward);
    imageModalCaption.textContent = displayDate
      ? `Unlocked ${rewardDateFormatter.format(displayDate)}.`
      : '';
  }
  imageModal.removeAttribute('hidden');
  imageModalTitle?.focus();
  document.addEventListener('keydown', handleImageModalKeydown);
};

const closeImageModal = () => {
  if (!imageModal) return;
  imageModal.setAttribute('hidden', '');
  if (imageModalPicture) {
    imageModalPicture.removeAttribute('src');
    imageModalPicture.removeAttribute('alt');
  }
  currentImageModalReward = null;
  document.removeEventListener('keydown', handleImageModalKeydown);
};

const attachGalleryPreviewHandlers = () => {
  if (!rewardsGalleryModal) return;
  const cards = rewardsGalleryModal.querySelectorAll('.gallery-card');
  cards.forEach((card) => {
    card.tabIndex = 0;
    card.onclick = (event) => {
      event.preventDefault();
      const reward = {
        id: card.dataset.rewardId,
        image: card.dataset.rewardImage,
        label: card.dataset.rewardLabel,
        message: card.dataset.rewardMessage,
        date: card.dataset.rewardDate,
        unlockedAt: card.dataset.rewardUnlocked
      };
      openImageModal(reward);
    };
    card.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const reward = {
          id: card.dataset.rewardId,
          image: card.dataset.rewardImage,
          label: card.dataset.rewardLabel,
          message: card.dataset.rewardMessage,
          date: card.dataset.rewardDate,
          unlockedAt: card.dataset.rewardUnlocked
        };
        openImageModal(reward);
      }
    };
  });
};

const renderRewardPlaceholder = () => {
  if (rewardCard) {
    rewardCard.setAttribute('hidden', '');
  }
  if (rewardEmptyState) {
    rewardEmptyState.removeAttribute('hidden');
  }
  if (rewardImage) {
    rewardImage.hidden = true;
    rewardImage.removeAttribute('src');
    rewardImage.removeAttribute('alt');
  }

  currentRewardToday = null;
  if (rewardImageTrigger) {
    rewardImageTrigger.dataset.rewardId = '';
    rewardImageTrigger.dataset.rewardImage = '';
    rewardImageTrigger.dataset.rewardLabel = '';
    rewardImageTrigger.dataset.rewardMessage = '';
    rewardImageTrigger.dataset.rewardDate = '';
    rewardImageTrigger.dataset.rewardUnlocked = '';
    rewardImageTrigger.setAttribute('aria-disabled', 'true');
    rewardImageTrigger.removeAttribute('aria-label');
    rewardImageTrigger.tabIndex = -1;
  }
};

const renderRewardCard = (reward) => {
  if (!rewardCard) return;
  rewardCard.removeAttribute('hidden');
  if (rewardEmptyState) {
    rewardEmptyState.setAttribute('hidden', '');
  }
  if (rewardImage) {
    if (reward.image) {
      rewardImage.src = reward.image;
      rewardImage.alt = reward.label || 'Milestone reward image';
      rewardImage.hidden = false;
      rewardImage.style.width = '100%';
      rewardImage.style.height = '100%';
      rewardImage.style.objectFit = 'cover';
    } else {
      rewardImage.hidden = true;
      rewardImage.removeAttribute('src');
      rewardImage.removeAttribute('alt');
    }
  }
  currentRewardToday = reward;
  if (rewardCard) {
    rewardCard.dataset.rewardId = reward.id || '';
    rewardCard.dataset.rewardImage = reward.image || '';
    rewardCard.dataset.rewardLabel = reward.label || reward.name || 'Reward';
    rewardCard.dataset.rewardMessage = reward.message || '';
    rewardCard.dataset.rewardDate = reward.date || '';
    rewardCard.dataset.rewardUnlocked = reward.unlockedAt || '';
  }
  if (rewardImageTrigger) {
    rewardImageTrigger.dataset.rewardId = reward.id || '';
    rewardImageTrigger.dataset.rewardImage = reward.image || '';
    rewardImageTrigger.dataset.rewardLabel = reward.label || reward.name || 'Reward';
    rewardImageTrigger.dataset.rewardMessage = reward.message || '';
    rewardImageTrigger.dataset.rewardDate = reward.date || '';
    rewardImageTrigger.dataset.rewardUnlocked = reward.unlockedAt || '';
    if (reward.image) {
      rewardImageTrigger.setAttribute('aria-disabled', 'false');
      rewardImageTrigger.setAttribute('aria-label', reward.label || reward.name || 'Milestone reward image');
      rewardImageTrigger.tabIndex = 0;
    } else {
      rewardImageTrigger.setAttribute('aria-disabled', 'true');
      rewardImageTrigger.removeAttribute('aria-label');
      rewardImageTrigger.tabIndex = -1;
    }
  }
};

const updateRewardGalleryView = (rewards) => {
  ensureRewardsGalleryController();
  if (rewardsGalleryController) {
    rewardsGalleryController.setRewards(rewards || []);
    attachGalleryPreviewHandlers();
  }
};

const refreshRewardsFromSupabase = async () => latestRewards;

const isRewardsAdminOpen = () =>
  Boolean(rewardsAdminModal && !rewardsAdminModal.hasAttribute('hidden'));

const updateRewardsUI = (metrics = null) => {
  if (!rewardSection) return;
  const globalEnabled = isFeatureEnabled('rewardsSystem');
  const userEnabled = isFeatureEnabledForUser('rewardsSystem');
  if (!globalEnabled || !userEnabled) {
    rewardSection.setAttribute('hidden', '');
    rewardSection.classList.add('sidebar__section--hidden');
    rewardSection.style.display = 'none';
    if (rewardEmptyState) {
      rewardEmptyState.setAttribute('hidden', '');
    }
    return;
  }
  rewardSection.removeAttribute('hidden');
  rewardSection.classList.remove('sidebar__section--hidden');
  rewardSection.style.removeProperty('display');

  const effectiveMetrics =
    metrics ||
    latestMetrics ||
    computeProjectMetrics(wordDataStore.getSnapshot(), currentProject, new Date());

  if (!currentProject?.id) {
    latestRewards = [];
    renderRewardPlaceholder();
    updateRewardGalleryView([]);
    return;
  }

  const result = evaluateTodayReward({
    projectId: currentProject.id,
    metrics: effectiveMetrics,
    today: new Date()
  });

  latestRewards = Array.isArray(result?.rewards) ? result.rewards : [];
  updateRewardGalleryView(latestRewards);

  if (result?.reward) {
    const rewardForCard = result.date
      ? { ...result.reward, date: result.date }
      : result.reward;
    renderRewardCard(rewardForCard);
  } else {
    renderRewardPlaceholder();
  }

  if (isRewardsAdminOpen()) {
    renderRewardsAdmin();
  }
};

const populateRewardsAdminSelect = () => {
  if (!rewardsAdminSelect) return;
  if (rewardsAdminSelect.options.length === rewardCatalog.length) {
    return;
  }
  rewardsAdminSelect.innerHTML = '';
  rewardCatalog.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    rewardsAdminSelect.appendChild(option);
  });
};

const getManifestForId = (id) => rewardCatalogMap.get(id) || null;

const resetRewardsAdminForm = (dateKey = getDateKey(new Date())) => {
  if (!rewardsAdminForm) return;
  rewardsAdminState.editingDate = null;
  if (rewardsAdminDateInput) {
    rewardsAdminDateInput.value = dateKey || '';
  }
  if (rewardsAdminSelect && rewardsAdminSelect.options.length) {
    rewardsAdminSelect.value = rewardsAdminSelect.options[0].value;
  }
  if (rewardsAdminMessageInput) {
    const selected = rewardsAdminSelect ? getManifestForId(rewardsAdminSelect.value) : null;
    rewardsAdminMessageInput.value = selected?.message || '';
  }
};

const loadRewardIntoForm = (reward) => {
  populateRewardsAdminSelect();
  if (rewardsAdminDateInput) {
    rewardsAdminDateInput.value = reward.date || '';
  }
  if (rewardsAdminSelect && reward.id) {
    rewardsAdminSelect.value = reward.id;
  }
  if (rewardsAdminMessageInput) {
    const manifest = getManifestForId(reward.id);
    rewardsAdminMessageInput.value = reward.message || manifest?.message || '';
  }
  rewardsAdminState.editingDate = reward.date || null;
};

const renderRewardsAdmin = () => {
  if (!rewardsAdminList) return;
  const rewards = Array.isArray(latestRewards) ? latestRewards : [];
  rewardsAdminList.innerHTML = '';

  if (!rewards.length) {
    if (rewardsAdminEmptyState) {
      rewardsAdminEmptyState.removeAttribute('hidden');
    }
    return;
  }

  if (rewardsAdminEmptyState) {
    rewardsAdminEmptyState.setAttribute('hidden', '');
  }

  rewards.forEach((reward) => {
    const row = document.createElement('div');
    row.className = 'rewards-admin__row';
    row.dataset.date = reward.date;
    row.dataset.rewardDate = reward.date || '';
    row.dataset.rewardId = reward.id || '';
    row.dataset.rewardImage = reward.image || '';
    row.dataset.rewardLabel = reward.label || reward.name || reward.id || '';
    row.dataset.rewardMessage = reward.message || '';

    const preview = document.createElement('div');
    preview.className = 'rewards-admin__preview';
    if (reward.image) {
      const img = document.createElement('img');
      img.src = reward.image;
      img.alt = reward.label || reward.name || 'Reward image';
      preview.appendChild(img);
    } else {
      preview.textContent = reward.emoji || '✨';
    }

    const details = document.createElement('div');
    details.className = 'rewards-admin__details';

    const title = document.createElement('p');
    title.className = 'rewards-admin__title';
    title.textContent = reward.label || reward.name || reward.id;
    details.appendChild(title);

    const date = document.createElement('p');
    date.className = 'rewards-admin__date';
    const parsedDate = parseDateInput(reward.date);
    date.textContent = parsedDate ? rewardDateFormatter.format(parsedDate) : reward.date;
    details.appendChild(date);

    if (reward.message) {
      const message = document.createElement('p');
      message.className = 'rewards-admin__message';
      message.textContent = reward.message;
      details.appendChild(message);
    }

    const actions = document.createElement('div');
    actions.className = 'rewards-admin__actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'link-button';
    editButton.dataset.adminRewardEdit = reward.date;
    editButton.textContent = 'Edit';
    actions.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'link-button action-list__item--danger';
    deleteButton.dataset.adminRewardDelete = reward.date;
    deleteButton.textContent = 'Delete';
    actions.appendChild(deleteButton);

    row.appendChild(preview);
    row.appendChild(details);
    row.appendChild(actions);

    rewardsAdminList.appendChild(row);
  });
};

const handleRewardsAdminSubmit = (event) => {
  event.preventDefault();
  if (!currentProject?.id) {
    window.alert('No active project.');
    return;
  }
  if (!rewardsAdminDateInput || !rewardsAdminSelect) return;

  const parsedDate = parseDateInput(rewardsAdminDateInput.value);
  const dateKey = parsedDate ? getDateKey(parsedDate) : null;
  if (!dateKey) {
    window.alert('Please provide a valid date.');
    return;
  }

  const rewardId = rewardsAdminSelect.value;
  if (!rewardId) {
    window.alert('Please select a reward.');
    return;
  }

  const message = rewardsAdminMessageInput?.value?.trim() || undefined;

  try {
    if (rewardsAdminState.editingDate && rewardsAdminState.editingDate !== dateKey) {
      removeRewardForDate(currentProject.id, rewardsAdminState.editingDate);
    }
    setRewardForDate({
      projectId: currentProject.id,
      dateKey,
      rewardId,
      message
    });
    renderRewardsAdmin();
    updateRewardsUI();
    rewardsAdminState.editingDate = null;
  } catch (error) {
    console.error('Unable to save reward.', error);
    window.alert('Unable to save reward.');
  }
};

const handleRewardsAdminDefault = (event) => {
  event.preventDefault();
  if (!rewardsAdminSelect || !rewardsAdminMessageInput) return;
  const entry = getManifestForId(rewardsAdminSelect.value);
  rewardsAdminMessageInput.value = entry?.message || '';
};

const handleRewardsAdminListClick = (event) => {
  const preview = event.target.closest('.rewards-admin__preview');
  if (preview) {
    const row = preview.closest('.rewards-admin__row');
    if (!row) return;
    const reward = {
      id: row.dataset.rewardId,
      image: row.dataset.rewardImage,
      label: row.dataset.rewardLabel,
      message: row.dataset.rewardMessage,
      date: row.dataset.rewardDate
    };
    if (reward.image) {
      openImageModal(reward);
    }
    return;
  }

  const editBtn = event.target.closest('[data-admin-reward-edit]');
  if (editBtn) {
    const dateKey = editBtn.dataset.adminRewardEdit;
    const rewards = Array.isArray(latestRewards) ? latestRewards : [];
    const reward = rewards.find((item) => item.date === dateKey);
    if (reward) {
      loadRewardIntoForm(reward);
    }
    return;
  }

  const deleteBtn = event.target.closest('[data-admin-reward-delete]');
  if (deleteBtn) {
    const dateKey = deleteBtn.dataset.adminRewardDelete;
    if (!dateKey) return;
    const confirmDelete = window.confirm(`Remove reward for ${dateKey}?`);
    if (!confirmDelete) return;
    removeRewardForDate(currentProject?.id, dateKey);
    renderRewardsAdmin();
    updateRewardsUI();
  }
};

const handleRewardsAdminKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeRewardsAdmin();
  }
};

const openRewardsAdmin = () => {
  if (!rewardManageButton) return;
  if (!isFeatureEnabledForUser('devFeatures')) {
    window.alert('Development tools are disabled. Enable them in Settings > Features.');
    return;
  }
  if (!rewardsAdminModal) return;
  populateRewardsAdminSelect();
  resetRewardsAdminForm();
  renderRewardsAdmin();
  rewardsAdminModal.removeAttribute('hidden');
  const title = rewardsAdminModal.querySelector('#rewards-admin-title');
  title?.focus();
  document.addEventListener('keydown', handleRewardsAdminKeydown);
};

const closeRewardsAdmin = () => {
  if (!rewardsAdminModal) return;
  rewardsAdminModal.setAttribute('hidden', '');
  rewardsAdminState.editingDate = null;
  document.removeEventListener('keydown', handleRewardsAdminKeydown);
};

const updateBookComparisons = (metrics) => {
  if (!bookComparisonsController || !isFeatureEnabled('bookComparisons')) return;
  if (!isFeatureEnabledForUser('bookComparisons')) {
    bookComparisonsController.update({ totalWords: Number.NaN });
    return;
  }
  if (!booksData.length) return;
  bookComparisonsController.update({ totalWords: metrics.totalWords });
};

const openDevEntriesEditor = () => {
  if (!isFeatureEnabledForUser('devFeatures')) {
    window.alert('Development tools are disabled. Enable them in Settings > Features.');
    return;
  }
  if (!entriesEditorController) {
    entriesEditorController = initEntriesEditor();
  }
  entriesEditorController?.open();
};

const toggleDevToolsVisibility = (enabled) => {
  if (devEditButton) {
    devEditButton.hidden = !enabled;
  }
  if (rewardManageButton) {
    rewardManageButton.hidden = !enabled;
  }
  if (!enabled) {
    closeRewardsAdmin();
  }
};

const applyCompactMode = (enabled) => {
  const body = document.body;
  if (body) {
    body.classList.toggle('is-compact-mode', Boolean(enabled));
  }

  if (bookComparisonsController && typeof bookComparisonsController.setCompactMode === 'function') {
    bookComparisonsController.setCompactMode(Boolean(enabled));
  }
};

const enableQuickAddModalMode = () => {
  if (!quickAddModalRoot || !wordEntryController) {
    return;
  }

  document.body.classList.add('is-quick-add-mode');
  quickAddTriggers.forEach((trigger) => trigger?.removeAttribute('hidden'));

  if (quickAddModeSelect && wordEntryController) {
    quickAddModeSelect.value = wordEntryController.getMode?.() || 'add';
    if (quickAddInput) {
      if (quickAddModeSelect.value === 'set') {
        quickAddInput.value = String(getCurrentTotalWords());
      } else {
        quickAddInput.value = '';
      }
    }
  }

  if (quickAddModalController) {
    quickAddModalController.destroy();
  }

  quickAddModalController = initQuickAddModal({
    modal: quickAddModalRoot,
    triggers: quickAddTriggers,
    input: quickAddInput,
    submitButton: quickAddSubmitButton,
    dismissElements: quickAddDismissButtons,
    errorField: quickAddErrorField,
    form: quickAddForm,
    modeSelect: quickAddModeSelect,
    getPrefillValue: (mode) => {
      if (mode === 'set') {
        return getCurrentTotalWords();
      }
      return '';
    },
    onModeChange: (mode) => {
      if (!wordEntryController) return;
      wordEntryController.setMode?.(mode, { persist: true, announce: false });
      if (mode === 'set') {
        refreshQuickAddSetValue();
      }
    },
    onSubmit: async ({ mode, value }) => {
      if (!wordEntryController) {
        throw new Error('Word entry is not available.');
      }
      await wordEntryController.quickSubmit(mode, value);
    }
  });
};

const disableQuickAddModalMode = () => {
  document.body.classList.remove('is-quick-add-mode');
  quickAddTriggers.forEach((trigger) => trigger?.setAttribute('hidden', ''));
  if (quickAddModalController) {
    quickAddModalController.destroy();
    quickAddModalController = null;
  }
  if (quickAddModalRoot && !quickAddModalRoot.hasAttribute('hidden')) {
    quickAddModalRoot.setAttribute('hidden', '');
  }
};

const enableQuickStatsBar = () => {
  if (!isFeatureEnabledForUser('quickStatsBar')) {
    disableQuickStatsBar();
    return;
  }
  if (!quickStatsController) {
    quickStatsController = initQuickStats();
  }
  if (quickStatsController) {
    quickStatsController.setEnabled(true);
    if (latestMetrics) {
      quickStatsController.update(latestMetrics);
    }
  }
};

const disableQuickStatsBar = () => {
  if (quickStatsController) {
    quickStatsController.destroy();
    quickStatsController = null;
  }
};

const getProjectTimeline = () => {
  const snapshot = wordDataStore.getSnapshot();
  const entries = snapshot.entries || [];

  let startKey = getDateKey(currentProject?.startDate);
  let endKey = getDateKey(currentProject?.endDate);

  if (!startKey || !endKey) {
    if (entries.length) {
      const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
      startKey = startKey || getDateKey(sorted[0].timestamp);
      endKey = endKey || getDateKey(sorted[sorted.length - 1].timestamp);
    } else {
      const today = new Date();
      const todayKey = getDateKey(today);
      startKey = startKey || todayKey;
      endKey = endKey || todayKey;
    }
  }

  const startDate = startOfDay(startKey);
  const endDate = startOfDay(endKey);
  if (!startDate || !endDate) {
    return startKey ? [startKey] : [];
  }

  const days = [];
  let cursor = startDate;
  while (cursor && cursor <= endDate) {
    const key = getDateKey(cursor);
    if (key) {
      days.push(key);
    }
    cursor = addDays(cursor, 1);
  }
  return days;
};

const initEntriesEditor = () => {
  const modal = document.querySelector('[data-entries-modal]');
  if (!modal) return null;

  const grid = modal.querySelector('[data-entries-grid]');
  const dismissButtons = Array.from(modal.querySelectorAll('[data-entries-dismiss]'));
  const saveButton = modal.querySelector('[data-entries-save]');

  if (!grid || !saveButton) return null;

  const state = {
    timeline: [],
    values: {}
  };

  const renderRows = () => {
    grid.innerHTML = '';
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    state.timeline.forEach((dateKey) => {
      const row = document.createElement('div');
      row.className = 'entries-row';

      const label = document.createElement('div');
      label.className = 'entries-row__label';
      const parsedDate = parseDateKey(dateKey) || parseDateInput(dateKey);
      label.textContent = parsedDate ? formatter.format(parsedDate) : dateKey;

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'entries-row__input';
      input.value = state.values[dateKey] ?? 0;
      input.dataset.entryDate = dateKey;

      row.append(label, input);
      grid.appendChild(row);
    });
  };

  const populate = () => {
    const snapshot = wordDataStore.getSnapshot();
    const dailyTotals = buildDailyTotals(snapshot.entries);
    const totalsMap = new Map(dailyTotals.map((point) => [point.date, point.delta]));

    state.timeline = getProjectTimeline();
    state.values = {};
    state.timeline.forEach((dateKey) => {
      state.values[dateKey] = totalsMap.get(dateKey) ?? 0;
    });
    renderRows();
  };

  const close = () => {
    modal.setAttribute('hidden', '');
  };

  dismissButtons.forEach((btn) => btn.addEventListener('click', close));

  grid.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const dateKey = target.dataset.entryDate;
    if (!dateKey) return;
    const value = Number(target.value);
    state.values[dateKey] = Number.isFinite(value) ? value : 0;
  });

  const applyChanges = async () => {
    if (!supabase || !authUser || !currentProject?.id) {
      window.alert('Sign in with development tools enabled to edit entries.');
      return;
    }

    const rows = state.timeline
      .map((dateKey) => ({
        project_id: currentProject.id,
        entry_date: dateKey,
        delta: Number(state.values[dateKey]) || 0
      }))
      .filter((row) => row.delta !== 0);

    try {
      const { error: deleteError } = await supabase
        .from('entries')
        .delete()
        .eq('project_id', currentProject.id);
      if (deleteError) {
        throw deleteError;
      }

      if (rows.length) {
        const { error: insertError } = await supabase
          .from('entries')
          .insert(rows);
        if (insertError) {
          throw insertError;
        }
      }

      await refreshEntriesFromSupabase();
      close();
    } catch (error) {
      console.error('Unable to apply entry changes', error);
      window.alert('Could not save the updated entries. Please try again.');
    }
  };

  saveButton.addEventListener('click', applyChanges);

  return {
    open() {
      populate();
      modal.removeAttribute('hidden');
      const title = modal.querySelector('#entries-modal-title');
      title?.focus();
    },
    close
  };
};

const enableBookComparisons = () => {
  if (!isFeatureEnabledForUser('bookComparisons')) {
    disableBookComparisons();
    return;
  }
  if (!bookComparisonsController) {
    bookComparisonsController = initBookComparisons();
    if (bookComparisonsController) {
      bookComparisonsController.setCompactMode(Boolean(featurePreferences.compactMode));
    }
  }

  loadBooks()
    .then((books) => {
      booksData = books || [];
      if (bookComparisonsController) {
        bookComparisonsController.setBooks(booksData);
        if (latestMetrics) {
          bookComparisonsController.update({ totalWords: latestMetrics.totalWords });
        }
      }
    })
    .catch((error) => {
      console.warn('Unable to load book comparisons data', error);
    });
};

const disableBookComparisons = () => {
  if (bookComparisonsController) {
    bookComparisonsController.destroy();
    bookComparisonsController = null;
  }
};

if (devEditButton) {
  devEditButton.addEventListener('click', openDevEntriesEditor);
}

const handleStatToggle = (id, enabled) => {
  setOptionalStatEnabled(id, enabled);
  updateProjectMetrics();
};

const handleFeatureToggle = (id, enabled) => {
  setFeatureEnabled(id, enabled);
};

const handleThemeChange = (themeId) => {
  updateTheme(themeId);
};

const handleProjectSave = ({ name, startDate, endDate, goal }) => {
  const trimmedName = (name || '').trim();
  const startValue = (startDate || '').trim();
  const endValue = (endDate || '').trim();
  const start = parseDateInput(startValue);
  const end = parseDateInput(endValue);
  const parsedGoal = Number(goal);
  const normalizedStart = getDateKey(start);
  const normalizedEnd = getDateKey(end);

  if (!trimmedName) {
    return { success: false, message: 'Please enter a project name.' };
  }
  if (!start || !end || Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return { success: false, message: 'Please provide valid start and end dates.' };
  }
  if (!normalizedStart || !normalizedEnd) {
    return { success: false, message: 'Dates must be valid calendar days.' };
  }
  if (end < start) {
    return { success: false, message: 'End date must be on or after the start date.' };
  }
  if (!Number.isFinite(parsedGoal) || parsedGoal <= 0) {
    return { success: false, message: 'Goal must be a positive number.' };
  }

  const roundedGoal = Math.round(parsedGoal);
  if (supabase && authUser && currentProject?.id) {
    return supabase
      .from('projects')
      .upsert({
        id: currentProject.id,
        user_id: authUser.id,
        name: trimmedName,
        goal: roundedGoal,
        start_date: normalizedStart,
        end_date: normalizedEnd,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Unable to save project', error);
          return { success: false, message: 'Could not save project. Please try again.' };
        }
        currentProject = {
          id: data.id,
          name: data.name,
          goal: data.goal,
          startDate: data.start_date,
          endDate: data.end_date
        };
        setProjectPreference(currentProject);
        ensureHeaderDefaults();
        if (settingsModalController) {
          settingsModalController.setProject(currentProject);
        }
        updateProjectMetrics();
        return { success: true, message: 'Project updated.' };
      });
  }

  currentProject = updateProject({
    ...currentProject,
    name: trimmedName,
    startDate: normalizedStart,
    endDate: normalizedEnd,
    goal: roundedGoal
  });

  const projectNameEl = document.querySelector(selectors.projectName);
  if (projectNameEl) {
    projectNameEl.textContent = currentProject.name;
  }

  if (settingsModalController) {
    settingsModalController.setProject(currentProject);
  }

  updateProjectMetrics();
  return { success: true, message: 'Project updated.' };
};

const enableCustomizableStats = () => {
  if (!settingsModalController) {
    settingsModalController = initSettingsModal({
      onStatToggle: handleStatToggle,
      onProjectSubmit: handleProjectSave,
      onFeatureToggle: handleFeatureToggle,
      onThemeChange: handleThemeChange,
      initialTheme: currentTheme
    });
    if (settingsModalController) {
      const selections = settingsModalController.getSelectedStats();
      Object.entries(selections).forEach(([id]) => {
        settingsModalController.setStatToggle(id, optionalStatIds[id] !== false);
      });
      const featureSelections = settingsModalController.getSelectedFeatures?.()
        || {};
      Object.entries(featureSelections).forEach(([id]) => {
        settingsModalController.setFeatureToggle(id, featurePreferences[id] !== false);
      });
    }
  }

  if (settingsModalController) {
    window.wordTrackerUI = window.wordTrackerUI || {};
    window.wordTrackerUI.settings = Object.freeze(getSettingsAPI());
    settingsModalController.setProject(currentProject);
    settingsModalController.setTheme(currentTheme);
    Object.entries(featurePreferences).forEach(([id, enabled]) => {
      settingsModalController.setFeatureToggle(id, enabled !== false);
    });
  }

  updateProjectMetrics();
};

const disableCustomizableStats = () => {
  if (settingsModalController) {
    settingsModalController.close();
    settingsModalController.destroy();
    settingsModalController = null;
  }

  Object.keys(optionalStatIds).forEach((id) => {
    optionalStatIds[id] = true;
  });

  if (window.wordTrackerUI && window.wordTrackerUI.settings) {
    delete window.wordTrackerUI.settings;
  }

  updateProjectMetrics();
};

const enableRewardsSystem = () => {
  if (!isFeatureEnabled('rewardsSystem') || !isFeatureEnabledForUser('rewardsSystem')) {
    return;
  }
  ensureRewardsGalleryController();
  populateRewardsAdminSelect();
  if (rewardSection) {
    rewardSection.removeAttribute('hidden');
    rewardSection.classList.remove('sidebar__section--hidden');
    rewardSection.style.removeProperty('display');
  }
  updateRewardsUI(latestMetrics);
};

const disableRewardsSystem = () => {
  if (rewardSection) {
    rewardSection.setAttribute('hidden', '');
    rewardSection.classList.add('sidebar__section--hidden');
    rewardSection.style.display = 'none';
  }
  if (rewardCard) {
    rewardCard.setAttribute('hidden', '');
  }
  if (rewardEmptyState) {
    rewardEmptyState.setAttribute('hidden', '');
  }
  latestRewards = [];
  if (rewardsGalleryController) {
    rewardsGalleryController.setRewards([]);
    if (typeof rewardsGalleryController.close === 'function') {
      rewardsGalleryController.close();
    }
  }
  if (rewardsAdminModal) {
    rewardsAdminModal.setAttribute('hidden', '');
  }
  closeImageModal();
  document.removeEventListener('keydown', handleRewardsAdminKeydown);
};

const persistPreferences = async () => {
  if (!supabase || !authUser) return;
  let localPrefs = getPreferences();
  const optionalStatsPayload = {};
  Object.keys(defaultOptionalStats).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(localPrefs.optionalStats || {}, key)) {
      optionalStatsPayload[key] = localPrefs.optionalStats[key] !== false;
    } else {
      optionalStatsPayload[key] = optionalStatIds[key] !== false;
    }
  });
  const featuresPayload = {};
  Object.keys(defaultFeaturePrefs).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(localPrefs.features || {}, key)) {
      featuresPayload[key] = localPrefs.features[key] !== false;
    } else {
      featuresPayload[key] = featurePreferences[key] !== false;
    }
  });
  let timestamp = localPrefs.updatedAt;
  if (!timestamp) {
    timestamp = new Date().toISOString();
    updatePreferences((prefs) => ({
      ...prefs,
      updatedAt: timestamp
    }));
    localPrefs = getPreferences();
  }
  const buildPayload = (includeTheme = true) => {
    const payload = {
      user_id: authUser.id,
      optional_stats: optionalStatsPayload,
      features: featuresPayload,
      updated_at: timestamp
    };
    if (includeTheme) {
      payload.theme = localPrefs.theme || currentTheme;
    }
    return payload;
  };

  const attemptUpsert = async (includeTheme) => supabase
    .from('preferences')
    .upsert(buildPayload(includeTheme), { onConflict: 'user_id' });

  let includeTheme = remotePreferencesSupportsTheme;
  let { error } = await attemptUpsert(includeTheme);
  if (error && includeTheme && error.code === 'PGRST204') {
    // Remote schema does not yet have a theme column; retry without it.
    remotePreferencesSupportsTheme = false;
    const retry = await attemptUpsert(false);
    if (retry.error) {
      console.error('Unable to persist preferences', retry.error);
    }
    return;
  }
  if (error) {
    console.error('Unable to persist preferences', error);
  }
};

const refreshEntriesFromSupabase = async () => {
  if (!supabase || !authUser || !currentProject?.id) {
    updateProjectMetrics();
    return;
  }
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('project_id', currentProject.id)
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Unable to load entries', error);
    return;
  }

  let cumulative = 0;
  const entries = (data || []).map((row) => {
    const entryDate = startOfDay(row.entry_date);
    const timestamp = entryDate ? entryDate.getTime() : Date.now();
    const entry = {
      id: row.id,
      mode: 'add',
      delta: row.delta,
      previousTotal: cumulative,
      newTotal: cumulative + row.delta,
      timestamp
    };
    cumulative += row.delta;
    return entry;
  });

  wordDataStore.replaceState({ total: cumulative, entries });
  updateProjectMetrics();
};

const overrideWordStoreForSupabase = () => {
  wordDataStore.addWords = async (amount) => {
    if (!supabase || !authUser || !currentProject?.id) {
      return baseWordStore.addWords(amount);
    }
    const delta = Number(amount);
    if (!Number.isFinite(delta) || delta === 0) {
      return wordDataStore.getSnapshot();
    }
    const dateKey = getDateKey(new Date());
    if (!dateKey) {
      console.error('Unable to derive date key for entry insertion.');
      return wordDataStore.getSnapshot();
    }
    const { error } = await supabase
      .from('entries')
      .insert({ project_id: currentProject.id, entry_date: dateKey, delta });
    if (error) {
      console.error('Unable to add entry', error);
      throw error;
    }
    await refreshEntriesFromSupabase();
    return wordDataStore.getSnapshot();
  };

  wordDataStore.setTotal = async (total) => {
    if (!supabase || !authUser || !currentProject?.id) {
      return baseWordStore.setTotal(total);
    }
    const snapshot = wordDataStore.getSnapshot();
    const target = Number(total);
    if (!Number.isFinite(target)) {
      return snapshot;
    }
    const delta = target - snapshot.total;
    if (delta === 0) {
      return snapshot;
    }
    const dateKey = getDateKey(new Date());
    if (!dateKey) {
      console.error('Unable to derive date key for total update.');
      return snapshot;
    }
    const { error } = await supabase
      .from('entries')
      .insert({ project_id: currentProject.id, entry_date: dateKey, delta });
    if (error) {
      console.error('Unable to set total', error);
      throw error;
    }
    await refreshEntriesFromSupabase();
    return wordDataStore.getSnapshot();
  };

  wordDataStore.undoLastEntry = async () => {
    if (!supabase || !authUser || !currentProject?.id) {
      return baseWordStore.undoLastEntry();
    }

    try {
      const { data: lastEntry, error: loadError } = await supabase
        .from('entries')
        .select('id')
        .eq('project_id', currentProject.id)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (loadError) {
        throw loadError;
      }

      if (!lastEntry) {
        return wordDataStore.getSnapshot();
      }

      const { error: deleteError } = await supabase
        .from('entries')
        .delete()
        .eq('id', lastEntry.id);

      if (deleteError) {
        throw deleteError;
      }

      await refreshEntriesFromSupabase();
      return wordDataStore.getSnapshot();
    } catch (error) {
      console.error('Unable to undo last entry', error);
      throw error;
    }
  };
};

const restoreBaseWordStore = () => {
  wordDataStore.addWords = baseWordStore.addWords;
  wordDataStore.setTotal = baseWordStore.setTotal;
  wordDataStore.undoLastEntry = baseWordStore.undoLastEntry;
};

const toggleAuthUI = (user) => {
  if (appRoot) {
    if (user) {
      appRoot.removeAttribute('inert');
      appRoot.removeAttribute('aria-hidden');
    } else {
      appRoot.setAttribute('inert', '');
      appRoot.setAttribute('aria-hidden', 'true');
    }
  }

  if (document.body) {
    document.body.style.overflow = user ? '' : 'hidden';
  }

  if (user) {
    if (authUserLabel) {
      authUserLabel.textContent = user.email || 'Signed in';
    }
    if (authEmailInput) {
      authEmailInput.value = '';
    }
  }

  if (authOverlay) {
    if (user) {
      authOverlay.setAttribute('hidden', '');
    } else {
      authOverlay.removeAttribute('hidden');
      if (authFeedback) {
        authFeedback.textContent = '';
      }
      window.setTimeout(() => {
        if (authEmailInput) {
          authEmailInput.focus();
        }
      }, 0);
    }
  }
};

const loadPreferencesForUser = async () => {
  Object.assign(optionalStatIds, defaultOptionalStats);
  Object.assign(featurePreferences, defaultFeaturePrefs);

  const localPrefs = getPreferences();

  const applyPreferencesSource = (source) => {
    const optional = source?.optionalStats || {};
    Object.keys(defaultOptionalStats).forEach((key) => {
      optionalStatIds[key] = optional[key] !== false;
    });

    const features = source?.features || {};
    Object.keys(defaultFeaturePrefs).forEach((key) => {
      featurePreferences[key] = features[key] !== false;
    });

    const theme = source?.theme;
    if (theme) {
      updateTheme(theme, { persistLocal: true, persistRemote: false });
    } else {
      updateTheme(currentTheme, { persistLocal: true, persistRemote: false });
    }
  };

  if (!supabase || !authUser) {
    applyPreferencesSource(localPrefs);
    updateProjectMetrics();
    return;
  }

  const { data, error } = await supabase
    .from('preferences')
    .select('*')
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Unable to load preferences', error);
    applyPreferencesSource(localPrefs);
    updateProjectMetrics();
    return;
  }

  const localTimestamp = Date.parse(localPrefs.updatedAt || '') || 0;
  const remoteTimestamp = data?.updated_at ? Date.parse(data.updated_at) : 0;

  if (!data || remoteTimestamp < localTimestamp) {
    applyPreferencesSource(localPrefs);
    await persistPreferences();
    updateProjectMetrics();
    return;
  }

  applyPreferencesSource({
    optionalStats: data.optional_stats || {},
    features: data.features || {},
    theme: data.theme || localPrefs.theme
  });

  updatePreferences((prefs) => ({
    ...prefs,
    optionalStats: {
      ...prefs.optionalStats,
      ...(data.optional_stats || {})
    },
    features: {
      ...prefs.features,
      ...(data.features || {})
    },
    theme: data.theme || prefs.theme,
    updatedAt: data.updated_at || new Date().toISOString()
  }));

  updateProjectMetrics();
};

const loadProjectForUser = async () => {
  if (!supabase || !authUser) {
    currentProject = createDefaultProject();
    setProjectPreference(currentProject);
    ensureHeaderDefaults();
    return null;
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Unable to load project', error);
    return null;
  }

  if (!data) {
    const defaults = createDefaultProject();
    const { data: inserted, error: insertError } = await supabase
      .from('projects')
      .insert({
        user_id: authUser.id,
        name: defaults.name,
        goal: defaults.goal,
        start_date: defaults.startDate,
        end_date: defaults.endDate
      })
      .select()
      .single();

    if (insertError) {
      console.error('Unable to create project', insertError);
      return null;
    }
    currentProject = {
      id: inserted.id,
      name: inserted.name,
      goal: inserted.goal,
      startDate: inserted.start_date,
      endDate: inserted.end_date
    };
  } else {
    currentProject = {
      id: data.id,
      name: data.name,
      goal: data.goal,
      startDate: data.start_date,
      endDate: data.end_date
    };
  }

  setProjectPreference(currentProject);
  ensureHeaderDefaults();
  return currentProject;
};

const loadUserData = async () => {
  await loadProjectForUser();
  await loadPreferencesForUser();

  Object.entries(optionalStatIds).forEach(([id, enabled]) => {
    setOptionalStatEnabled(id, enabled, { syncRemote: false });
  });
  Object.entries(featurePreferences).forEach(([id, enabled]) => {
    setFeatureEnabled(id, enabled, { syncRemote: false });
  });

  if (settingsModalController) {
    settingsModalController.setProject(currentProject);
    Object.entries(optionalStatIds).forEach(([id, enabled]) => {
      settingsModalController.setStatToggle(id, enabled !== false);
    });
    Object.entries(featurePreferences).forEach(([id, enabled]) => {
      settingsModalController.setFeatureToggle(id, enabled !== false);
    });
    settingsModalController.setTheme(currentTheme);
  }

  overrideWordStoreForSupabase();
  await refreshEntriesFromSupabase();
  await refreshRewardsFromSupabase();
  updateRewardsUI(latestMetrics);
};

const clearUserData = () => {
  restoreBaseWordStore();
  baseWordStore.reset();
  Object.assign(optionalStatIds, defaultOptionalStats);
  Object.assign(featurePreferences, defaultFeaturePrefs);

  Object.entries(optionalStatIds).forEach(([id, enabled]) => {
    setOptionalStatEnabled(id, enabled, { syncRemote: false });
  });
  Object.entries(featurePreferences).forEach(([id, enabled]) => {
    setFeatureEnabled(id, enabled, { syncRemote: false });
  });

  currentProject = createDefaultProject();
  setProjectPreference(currentProject);
  ensureHeaderDefaults();

  setRewardsStore({});
  updateTheme('classic', { persistLocal: true, persistRemote: false });

  if (settingsModalController) {
    settingsModalController.setProject(currentProject);
    Object.entries(optionalStatIds).forEach(([id, enabled]) => {
      settingsModalController.setStatToggle(id, enabled !== false);
    });
    Object.entries(featurePreferences).forEach(([id, enabled]) => {
      settingsModalController.setFeatureToggle(id, enabled !== false);
    });
  }

  updateProjectMetrics();
  applyFeatureFlags();

  if (authUser) {
    persistPreferences();
  }
};

const applyAuthState = async (user) => {
  const sameUser = authUser && user && authUser.id === user.id;
  authUser = user;
  toggleAuthUI(user);
  if (!user) {
    if (authFeedback) {
      authFeedback.textContent = '';
    }
    clearUserData();
    return;
  }
  if (sameUser) {
    return;
  }
  if (authFeedback) {
    authFeedback.textContent = '';
  }
  try {
    await loadUserData();
  } catch (error) {
    console.error('Unable to load user data', error);
  }
};

const initAuth = async () => {
  if (!supabase) {
    toggleAuthUI(null);
    return;
  }
  const { data } = await supabase.auth.getSession();
  await applyAuthState(data?.session?.user || null);
  supabase.auth.onAuthStateChange(async (_event, session) => {
    await applyAuthState(session?.user || null);
  });
};

const registerDataListeners = () => {
  if (dataListenersRegistered) return;

  const onDataChanged = () => {
    updateProjectMetrics();
    refreshQuickAddSetValue();
  };

  window.addEventListener(wordDataStore.events.entryAdded, onDataChanged);
  window.addEventListener(wordDataStore.events.entryUndone, onDataChanged);

  dataListenersRegistered = true;
};

const applyFeatureFlags = () => {
  const { body } = document;
  if (!body) return;

  body.dataset.featureNewLayout = String(FEATURES.newLayout);
  body.dataset.featureNewWordEntry = String(FEATURES.newWordEntry);
  body.dataset.featureProgressSummary = String(FEATURES.newProgressSummary);
  body.dataset.featureRewardsSystem = String(FEATURES.rewardsSystem);
  body.dataset.featureBookComparisons = String(FEATURES.bookComparisons);
  body.dataset.featureQuickStatsBar = String(FEATURES.quickStatsBar);
  body.dataset.featureQuickAddModal = String(FEATURES.quickAddModal);

  const newLayoutRoot = document.querySelector(selectors.newLayoutRoot);
  if (!newLayoutRoot) {
    return;
  }

  if (isFeatureEnabled('newLayout')) {
    ensureHeaderDefaults();
    newLayoutRoot.removeAttribute('hidden');
    window.wordTrackerUI = window.wordTrackerUI || {};
    window.wordTrackerUI.newLayout = Object.freeze(newLayoutAPI);
    enableSidebar();
    enableGraph();
  } else {
    newLayoutRoot.setAttribute('hidden', '');
    disableSidebar();
    disableGraph();
  }

  if (isFeatureEnabled('newWordEntry')) {
    enableNewWordEntry();
  } else {
    disableNewWordEntry();
  }

  if (isFeatureEnabled('newProgressSummary')) {
    enableProgressSummary();
  } else {
    disableProgressSummary();
  }

  if (isFeatureEnabled('rewardsSystem')) {
    enableRewardsSystem();
  } else {
    disableRewardsSystem();
  }

  if (isFeatureEnabled('customizableStats')) {
    enableCustomizableStats();
  } else {
    disableCustomizableStats();
  }

  if (isFeatureEnabled('bookComparisons') && isFeatureEnabledForUser('bookComparisons')) {
    enableBookComparisons();
  } else {
    disableBookComparisons();
  }

  if (isFeatureEnabled('quickStatsBar') && isFeatureEnabledForUser('quickStatsBar')) {
    enableQuickStatsBar();
  } else {
    disableQuickStatsBar();
  }

  if (isFeatureEnabled('quickAddModal') && isFeatureEnabledForUser('quickAddModal')) {
    enableQuickAddModalMode();
  } else {
    disableQuickAddModalMode();
  }

  toggleDevToolsVisibility(isFeatureEnabledForUser('devFeatures'));

  updateProjectMetrics();
};

registerDataListeners();
setupDataManagementControls();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyFeatureFlags);
} else {
  applyFeatureFlags();
}

if (authForm) {
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabase) {
      authFeedback.textContent = 'Supabase is not configured.';
      return;
    }
    const email = authEmailInput?.value.trim();
    if (!email) {
      authFeedback.textContent = 'Please enter an email address.';
      return;
    }
    try {
      authFeedback.textContent = 'Sending magic link...';
      authSubmitButton && (authSubmitButton.disabled = true);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
      if (error) {
        authFeedback.textContent = error.message;
      } else {
        authFeedback.textContent = 'Check your email for the login link.';
      }
    } catch (error) {
      authFeedback.textContent = 'Unable to send login link.';
      console.error(error);
    } finally {
      authSubmitButton && (authSubmitButton.disabled = false);
    }
  });
}

logoutButton?.addEventListener('click', async (event) => {
  event.preventDefault();
  if (supabase) {
    await supabase.auth.signOut();
  } else {
    applyAuthState(null);
  }
});

initAuth();
