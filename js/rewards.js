import { getDateKey } from './date-utils.js';
import { getRewardCatalog } from './rewards-manifest.js';

const STORAGE_KEY = 'wordtracker:v2:rewards';

const catalog = getRewardCatalog();

const readStore = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (error) {
    console.warn('Failed to read rewards store', error);
    return {};
  }
};

const writeStore = (store) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store || {}));
  } catch (error) {
    console.warn('Failed to persist rewards store', error);
  }
};

const toDateKey = (value) => getDateKey(value);

const findRewardById = (id) => (id ? catalog.find((entry) => entry.id === id) || null : null);

const mergeRewardDetails = (reward) => {
  if (!reward || typeof reward !== 'object') {
    return null;
  }
  const manifest = findRewardById(reward.id);
  if (!manifest) {
    return {
      ...reward,
      unlockedAt: reward.unlockedAt || new Date().toISOString()
    };
  }
  return {
    id: manifest.id,
    pack: manifest.pack,
    image: manifest.image,
    label: manifest.label,
    message: reward.message || manifest.message,
    unlockedAt: reward.unlockedAt || new Date().toISOString()
  };
};

const selectReward = (projectRewards = {}) => {
  const usage = new Map();
  Object.values(projectRewards).forEach((reward) => {
    if (reward && reward.id) {
      const count = usage.get(reward.id) || 0;
      usage.set(reward.id, count + 1);
    }
  });

  let candidate = null;
  let minCount = Infinity;
  catalog.forEach((entry) => {
    const count = usage.get(entry.id) || 0;
    if (count < minCount) {
      minCount = count;
      candidate = entry;
    }
  });
  return candidate || catalog[0];
};

const persistReward = (projectId, dateKey, reward) => {
  const store = readStore();
  const projectRewards = store[projectId] || {};
  projectRewards[dateKey] = reward;
  store[projectId] = projectRewards;
  writeStore(store);
  return reward;
};

export const getRewardsStore = () => readStore();

export const setRewardsStore = (store) => {
  const next = typeof store === 'object' && store !== null ? store : {};
  writeStore(next);
};

export const getProjectRewards = (projectId) => {
  if (!projectId) return [];
  const store = readStore();
  const projectRewards = store[projectId] || {};
  return Object.entries(projectRewards)
    .map(([date, reward]) => {
      const merged = mergeRewardDetails(reward);
      return merged
        ? {
            ...merged,
            date
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
};

export const getTodayReward = (projectId, today = new Date()) => {
  if (!projectId) return null;
  const store = readStore();
  const projectRewards = store[projectId] || {};
  const key = toDateKey(today);
  return mergeRewardDetails(projectRewards[key]) || null;
};

export const evaluateTodayReward = ({ projectId, metrics, today = new Date() }) => {
  if (!projectId) {
    return { reward: null, rewards: [], unlockedToday: false, date: null };
  }

  const store = readStore();
  const projectRewards = store[projectId] || {};
  const dateKey = toDateKey(today);
  const existingReward = projectRewards[dateKey]
    ? mergeRewardDetails(projectRewards[dateKey])
    : null;
  const goalMet = metrics?.highlightToday || false;

  if (!goalMet) {
    return {
      reward: existingReward,
      rewards: getProjectRewards(projectId),
      unlockedToday: false,
      date: dateKey
    };
  }

  if (existingReward) {
    return {
      reward: existingReward,
      rewards: getProjectRewards(projectId),
      unlockedToday: false,
      date: dateKey
    };
  }

  const selection = selectReward(projectRewards);
  const rewardRecord = mergeRewardDetails({
    id: selection.id,
    message: selection.message,
    unlockedAt: new Date().toISOString()
  });

  persistReward(projectId, dateKey, rewardRecord);

  return {
    reward: rewardRecord,
    rewards: getProjectRewards(projectId),
    unlockedToday: true,
    date: dateKey
  };
};

export const setRewardForDate = ({ projectId, dateKey, rewardId, message, unlockedAt }) => {
  if (!projectId || !dateKey || !rewardId) {
    throw new Error('Project, date, and reward id are required.');
  }
  const entry = findRewardById(rewardId);
  if (!entry) {
    throw new Error('Unknown reward id.');
  }
  const record = mergeRewardDetails({
    id: entry.id,
    message: message || entry.message,
    unlockedAt: unlockedAt || new Date().toISOString()
  });
  persistReward(projectId, dateKey, record);
  return record;
};

export const removeRewardForDate = (projectId, dateKey) => {
  if (!projectId || !dateKey) return;
  const store = readStore();
  if (!store[projectId]) return;
  delete store[projectId][dateKey];
  if (!Object.keys(store[projectId]).length) {
    delete store[projectId];
  }
  writeStore(store);
};

export const clearRewards = (projectId) => {
  const store = readStore();
  if (projectId) {
    delete store[projectId];
  } else {
    Object.keys(store).forEach((key) => delete store[key]);
  }
  writeStore(store);
};

export const replaceProjectRewards = (projectId, rewards = []) => {
  if (!projectId) return [];
  const store = readStore();
  const projectRewards = {};
  (Array.isArray(rewards) ? rewards : []).forEach((reward) => {
    if (!reward || typeof reward !== 'object') {
      return;
    }
    const dateKey =
      typeof reward.date === 'string'
        ? reward.date
        : reward.date
        ? toDateKey(reward.date)
        : toDateKey(reward.reward_date);
    if (!dateKey) {
      return;
    }
    const record = mergeRewardDetails({
      id: reward.id || reward.rewardId || reward.reward_id,
      message: reward.message ?? reward.rewardMessage ?? reward.reward_message,
      unlockedAt: reward.unlockedAt || reward.unlocked_at
    });
    if (record) {
      projectRewards[dateKey] = record;
    }
  });

  if (Object.keys(projectRewards).length) {
    store[projectId] = projectRewards;
  } else {
    delete store[projectId];
  }
  writeStore(store);
  return getProjectRewards(projectId);
};

export default {
  getRewardsStore,
  setRewardsStore,
  getProjectRewards,
  getTodayReward,
  evaluateTodayReward,
  setRewardForDate,
  removeRewardForDate,
  clearRewards,
  replaceProjectRewards
};
