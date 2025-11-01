import { getDateKey, parseDateKey } from './date-utils.js';
import { getRewardCatalog } from './rewards-manifest.js';

const STORAGE_KEY = 'wordtracker:v2:milestone-rewards';

const catalog = getRewardCatalog();
const rewardStateCache = new Map();

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
    message: reward.message ?? manifest.message,
    unlockedAt: reward.unlockedAt || new Date().toISOString()
  };
};

const computeMilestoneSize = (goalWords, totalDays) => {
  const safeGoal = Number.isFinite(goalWords) ? goalWords : 0;
  const safeDays = Number.isFinite(totalDays) ? totalDays : 0;
  if (safeGoal <= 0) return 0;
  if (safeDays <= 0) return safeGoal;
  return safeGoal / safeDays;
};

const toIsoFromDateKey = (dateKey, fallbackDate) => {
  if (dateKey) {
    const parsed = parseDateKey(dateKey);
    if (parsed) {
      parsed.setHours(0, 0, 0, 0);
      return parsed.toISOString();
    }
  }
  if (fallbackDate instanceof Date && !Number.isNaN(fallbackDate.valueOf())) {
    const clone = new Date(fallbackDate.getTime());
    clone.setHours(0, 0, 0, 0);
    return clone.toISOString();
  }
  return new Date().toISOString();
};

const buildMilestoneDates = (milestoneCount, milestoneSize, dailyTotals = []) => {
  if (!milestoneCount || milestoneSize <= 0) {
    return [];
  }

  const dates = new Array(milestoneCount).fill(null);
  const epsilon = 1e-6;
  let milestoneIndex = 1;

  const sortedTotals = [...dailyTotals].sort((a, b) => {
    const aDate = String(a?.date || '');
    const bDate = String(b?.date || '');
    return aDate.localeCompare(bDate);
  });

  sortedTotals.forEach((day) => {
    const cumulative = Number.isFinite(day?.cumulative) ? day.cumulative : 0;
    while (
      milestoneIndex <= milestoneCount &&
      cumulative + epsilon >= milestoneSize * milestoneIndex
    ) {
      if (!dates[milestoneIndex - 1]) {
        dates[milestoneIndex - 1] = day.date;
      }
      milestoneIndex += 1;
    }
  });

  return dates;
};

const getProjectOverrides = (projectId) => {
  if (!projectId) return {};
  const store = readStore();
  const projectOverrides = store[projectId];
  return projectOverrides && typeof projectOverrides === 'object' ? projectOverrides : {};
};

const persistOverride = (projectId, dateKey, reward) => {
  if (!projectId || !dateKey) return reward;
  const store = readStore();
  const projectOverrides =
    store[projectId] && typeof store[projectId] === 'object' ? store[projectId] : {};
  projectOverrides[dateKey] = reward;
  store[projectId] = projectOverrides;
  writeStore(store);
  rewardStateCache.delete(projectId);
  return reward;
};

const removeOverride = (projectId, dateKey) => {
  if (!projectId || !dateKey) return;
  const store = readStore();
  const projectOverrides =
    store[projectId] && typeof store[projectId] === 'object' ? store[projectId] : null;
  if (!projectOverrides) return;
  delete projectOverrides[dateKey];
  if (!Object.keys(projectOverrides).length) {
    delete store[projectId];
  } else {
    store[projectId] = projectOverrides;
  }
  writeStore(store);
  rewardStateCache.delete(projectId);
};

const buildMilestoneRewards = ({ projectId, metrics, today }) => {
  if (!catalog.length) {
    return {
      milestoneSize: 0,
      milestoneCount: 0,
      rewards: [],
      latest: null
    };
  }

  const totalWords = Number.isFinite(metrics?.totalWords) ? metrics.totalWords : 0;
  const goalWords = Number.isFinite(metrics?.goalWords) ? metrics.goalWords : 0;
  const totalDays = Number.isFinite(metrics?.dayPhase?.totalDays)
    ? metrics.dayPhase.totalDays
    : 0;
  const milestoneSize = computeMilestoneSize(goalWords, totalDays);

  if (!milestoneSize || milestoneSize <= 0) {
    return {
      milestoneSize,
      milestoneCount: 0,
      rewards: [],
      latest: null
    };
  }

  const milestoneCount = Math.floor(totalWords / milestoneSize);
  if (milestoneCount <= 0) {
    return {
      milestoneSize,
      milestoneCount: 0,
      rewards: [],
      latest: null
    };
  }

  const overrides = getProjectOverrides(projectId);
  const milestoneDates = buildMilestoneDates(
    milestoneCount,
    milestoneSize,
    Array.isArray(metrics?.dailyTotals) ? metrics.dailyTotals : []
  );

  const rewards = [];
  const todayKey = getDateKey(today);

  for (let index = 0; index < milestoneCount; index += 1) {
    const milestoneNumber = index + 1;
    const manifest = catalog[index % catalog.length];
    if (!manifest) {
      continue;
    }

    const milestoneDate = milestoneDates[index] || todayKey || null;
    const override =
      (milestoneDate && overrides[milestoneDate]) || overrides[`milestone-${milestoneNumber}`];
    const unlockedAt =
      override?.unlockedAt || toIsoFromDateKey(milestoneDate, parseDateKey(milestoneDate) || today);

    const baseRecord = mergeRewardDetails({
      id: override?.id || manifest.id,
      message:
        override && override.message !== undefined ? override.message : manifest.message,
      unlockedAt
    });

    if (!baseRecord) {
      continue;
    }

    rewards.push({
      ...baseRecord,
      date: milestoneDate || null,
      milestone: milestoneNumber,
      milestoneWords: milestoneSize * milestoneNumber
    });
  }

  rewards.sort((a, b) => {
    if (a.milestone === b.milestone) {
      return (b.date || '').localeCompare(a.date || '');
    }
    return b.milestone - a.milestone;
  });

  return {
    milestoneSize,
    milestoneCount,
    rewards,
    latest: rewards[0] || null
  };
};

export const getRewardsStore = () => readStore();

export const setRewardsStore = (store) => {
  const next = typeof store === 'object' && store !== null ? store : {};
  writeStore(next);
  rewardStateCache.clear();
};

export const clearRewards = (projectId) => {
  const store = readStore();
  if (projectId) {
    delete store[projectId];
    rewardStateCache.delete(projectId);
  } else {
    Object.keys(store).forEach((key) => delete store[key]);
    rewardStateCache.clear();
  }
  writeStore(store);
};

export const evaluateTodayReward = ({ projectId, metrics, today = new Date() }) => {
  const result = buildMilestoneRewards({ projectId, metrics, today });
  const cached = projectId ? rewardStateCache.get(projectId) : null;
  const previousCount = cached?.milestoneCount || 0;
  const todayKey = getDateKey(today);

  const unlockedToday =
    Boolean(projectId) &&
    result.milestoneCount > previousCount &&
    result.latest?.date &&
    result.latest.date === todayKey;

  if (projectId) {
    rewardStateCache.set(projectId, {
      reward: result.latest,
      rewards: result.rewards,
      milestoneCount: result.milestoneCount,
      milestoneSize: result.milestoneSize
    });
  }

  return {
    reward: result.latest,
    rewards: result.rewards,
    unlockedToday,
    date: result.latest?.date || null,
    milestone: {
      size: result.milestoneSize,
      count: result.milestoneCount
    }
  };
};

export const getProjectRewards = (projectId) => {
  if (!projectId) return [];
  const cached = rewardStateCache.get(projectId);
  return cached?.rewards ? [...cached.rewards] : [];
};

export const getTodayReward = (projectId) => {
  if (!projectId) return null;
  const cached = rewardStateCache.get(projectId);
  return cached?.reward || null;
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
    message: message ?? entry.message,
    unlockedAt: unlockedAt || toIsoFromDateKey(dateKey)
  });
  persistOverride(projectId, dateKey, record);
  return {
    ...record,
    date: dateKey
  };
};

export const removeRewardForDate = (projectId, dateKey) => {
  removeOverride(projectId, dateKey);
};

export const replaceProjectRewards = (projectId, rewards = []) => {
  if (!projectId) return [];
  const store = readStore();
  const projectOverrides = {};

  (Array.isArray(rewards) ? rewards : []).forEach((reward) => {
    if (!reward || typeof reward !== 'object') {
      return;
    }
    const dateKey =
      typeof reward.date === 'string'
        ? reward.date
        : reward.date
        ? getDateKey(reward.date)
        : getDateKey(reward.reward_date);
    if (!dateKey) {
      return;
    }
    const record = mergeRewardDetails({
      id: reward.id || reward.rewardId || reward.reward_id,
      message: reward.message ?? reward.rewardMessage ?? reward.reward_message,
      unlockedAt: reward.unlockedAt || reward.unlocked_at
    });
    if (record) {
      projectOverrides[dateKey] = record;
    }
  });

  if (Object.keys(projectOverrides).length) {
    store[projectId] = projectOverrides;
  } else {
    delete store[projectId];
  }
  writeStore(store);
  rewardStateCache.delete(projectId);
  return getProjectRewards(projectId);
};

export default {
  getRewardsStore,
  setRewardsStore,
  clearRewards,
  evaluateTodayReward,
  getProjectRewards,
  getTodayReward,
  setRewardForDate,
  removeRewardForDate,
  replaceProjectRewards
};
