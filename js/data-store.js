const STORAGE_KEY = 'wordtracker:v2:entries';

const EVENTS = {
  entryAdded: 'wordtracker:entry-added',
  entryUndone: 'wordtracker:entry-undone'
};

const defaultState = () => ({
  total: 0,
  entries: []
});

const readState = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return defaultState();
    }
    return {
      total: Number.isFinite(parsed.total) ? parsed.total : 0,
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch (error) {
    console.warn('Failed to parse stored entries; clearing cache.', error);
    return defaultState();
  }
};

const writeState = (state) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const dispatchAppEvent = (name, detail) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

const state = readState();

const cloneState = () => ({
  total: state.total,
  entries: state.entries.map((entry) => ({ ...entry }))
});

const clampToZero = (value) => (value < 0 ? 0 : value);

const generateEntry = ({ mode, delta, previousTotal, newTotal, timestamp }) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  mode,
  delta,
  previousTotal,
  newTotal,
  timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
});

const commit = () => {
  writeState(state);
};

const applyReplacement = (nextState = {}) => {
  const total = Number.isFinite(nextState.total) ? nextState.total : 0;
  const entries = Array.isArray(nextState.entries) ? nextState.entries : [];
  state.total = clampToZero(total);
  state.entries = entries.map((entry) => ({
    ...entry,
    timestamp: Number.isFinite(entry?.timestamp) ? entry.timestamp : Date.now(),
    delta: Number.isFinite(entry?.delta) ? entry.delta : 0,
    previousTotal: Number.isFinite(entry?.previousTotal) ? entry.previousTotal : 0,
    newTotal: Number.isFinite(entry?.newTotal) ? entry.newTotal : state.total
  }));
  commit();
  dispatchAppEvent(EVENTS.entryAdded, { total: state.total, entry: null });
};

const addWords = async (amount) => {
  const delta = Number.isFinite(amount) ? amount : 0;
  const previousTotal = state.total;
  let newTotal = previousTotal + delta;
  newTotal = clampToZero(newTotal);

  const entry = generateEntry({
    mode: 'add',
    delta,
    previousTotal,
    newTotal
  });

  state.total = newTotal;
  state.entries.push(entry);
  commit();

  const snapshot = { total: state.total, entry };
  dispatchAppEvent(EVENTS.entryAdded, snapshot);

  return snapshot;
};

const setTotal = async (total) => {
  const desiredTotal = Number.isFinite(total) ? total : state.total;
  const newTotal = clampToZero(desiredTotal);
  const previousTotal = state.total;
  const delta = newTotal - previousTotal;

  if (delta === 0) {
    return { total: state.total, entry: null };
  }

  const entry = generateEntry({
    mode: 'set',
    delta,
    previousTotal,
    newTotal
  });

  state.total = newTotal;
  state.entries.push(entry);
  commit();

  const snapshot = { total: state.total, entry };
  dispatchAppEvent(EVENTS.entryAdded, snapshot);
  return snapshot;
};

const undoLastEntry = async () => {
  if (state.entries.length === 0) {
    return { total: state.total, entry: null };
  }

  const entry = state.entries.pop();
  state.total = clampToZero(entry.previousTotal);
  commit();

  const snapshot = { total: state.total, entry };
  dispatchAppEvent(EVENTS.entryUndone, snapshot);
  return snapshot;
};

export const wordDataStore = {
  events: EVENTS,

  getSnapshot() {
    return cloneState();
  },

  async addWords(amount) {
    return addWords(amount);
  },

  async setTotal(total) {
    return setTotal(total);
  },

  async undoLastEntry() {
    return undoLastEntry();
  },

  reset() {
    state.total = 0;
    state.entries = [];
    commit();
  },

  replaceState(nextState) {
    applyReplacement(nextState);
  }
};

export default wordDataStore;
