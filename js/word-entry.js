import { wordDataStore } from './data-store.js';

const MODE_STORAGE_KEY = 'wordtracker:v2:entry-mode';

const STATUS_MESSAGES = {
  idle: 'Enter your words to see progress updates here.',
  saving: 'Saving your words...',
  invalidNumber: 'Please enter a valid number of words.',
  zeroDelta: 'No change recorded. Enter a positive or negative number.',
  negativeTotal: 'Total words cannot be negative. Please enter zero or a positive number.',
  undoUnavailable: 'No previous entry to undo.',
  undoSuccess: 'Last entry removed.',
  error: 'Something went wrong while saving. Please try again.',
  modeAdd: 'Add words mode: log the change since your last update.',
  modeSet: 'Set total mode: update your running total directly.'
};

const clampToZero = (value) => (value < 0 ? 0 : value);

const formatNumber = (value) => Number(value || 0).toLocaleString();

export class WordEntryController {
  constructor({
    root,
    form,
    modeField,
    countField,
    statusField,
    updateButton,
    undoButton,
    store = wordDataStore,
    eventTarget = window
  }) {
    this.root = root;
    this.form = form;
    this.modeField = modeField;
    this.countField = countField;
    this.statusField = statusField;
    this.updateButton = updateButton;
    this.undoButton = undoButton;
    this.store = store;
    this.eventTarget = eventTarget;

    this.state = {
      totalWords: 0,
      lastEntry: null
    };

    this.isProcessing = false;

    this.boundOnSubmit = this.handleSubmit.bind(this);
    this.boundOnUndo = this.handleUndo.bind(this);
    this.boundOnModeChange = this.handleModeChange.bind(this);
  }

  init() {
    if (!this.form || !this.modeField || !this.countField) {
      return;
    }

    const snapshot = this.store.getSnapshot();
    this.state.totalWords = clampToZero(snapshot.total);
    this.state.lastEntry = snapshot.entries.length ? snapshot.entries[snapshot.entries.length - 1] : null;

    const initialMode = this.loadPersistedMode() || 'add';
    this.setMode(initialMode, { persist: false, announce: false });

    this.form.addEventListener('submit', this.boundOnSubmit);
    this.modeField.addEventListener('change', this.boundOnModeChange);

    if (this.undoButton) {
      this.undoButton.addEventListener('click', this.boundOnUndo);
    }

    this.updateUndoAvailability();
    if (this.state.totalWords > 0) {
      this.updateStatus('Progress synced.');
    } else {
      this.updateStatus(STATUS_MESSAGES.idle);
    }
  }

  destroy() {
    if (this.form) {
      this.form.removeEventListener('submit', this.boundOnSubmit);
    }

    if (this.modeField) {
      this.modeField.removeEventListener('change', this.boundOnModeChange);
    }

    if (this.undoButton) {
      this.undoButton.removeEventListener('click', this.boundOnUndo);
    }
  }

  setProcessing(isProcessing) {
    this.isProcessing = isProcessing;

    if (this.updateButton) {
      this.updateButton.disabled = isProcessing;
    }

    if (this.form) {
      this.form.setAttribute('aria-busy', String(isProcessing));
    }

    this.updateUndoAvailability();
  }

  updateStatus(message) {
    if (this.statusField) {
      this.statusField.textContent = message;
    }
  }

  focusInput() {
    if (this.countField) {
      this.countField.focus();
    }
  }

  setTotalWords(total) {
    const safeTotal = clampToZero(Number.isFinite(total) ? total : 0);
    this.state.totalWords = safeTotal;
    this.state.lastEntry = null;
    this.updateUndoAvailability();
    this.updateStatus('Progress synced.');
  }

  getState() {
    return { ...this.state };
  }

  getMode() {
    return this.getModeValue();
  }

  getTotalWords() {
    return this.state.totalWords;
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.isProcessing) return;

    const mode = this.getModeValue();
    const rawValue = Number.parseInt(this.countField.value, 10);

    if (!Number.isFinite(rawValue) || Number.isNaN(rawValue)) {
      this.updateStatus(STATUS_MESSAGES.invalidNumber);
      this.focusInput();
      return;
    }

    if (mode === 'add') {
      await this.processAddMode(rawValue);
    } else {
      await this.processSetMode(rawValue);
    }
  }

  async handleUndo() {
    if (this.isProcessing) return;

    if (!this.state.lastEntry) {
      this.updateStatus(STATUS_MESSAGES.undoUnavailable);
      return;
    }

    this.setProcessing(true);
    this.updateStatus(STATUS_MESSAGES.saving);

    try {
      const result = await this.store.undoLastEntry();
      if (!result.entry) {
        this.updateStatus(STATUS_MESSAGES.undoUnavailable);
        return;
      }

      this.state.totalWords = result.total;
      this.state.lastEntry = null;
      this.updateStatus(`${STATUS_MESSAGES.undoSuccess} Total: ${formatNumber(this.state.totalWords)}.`);
    } catch (error) {
      console.error('Failed to undo last entry.', error);
      this.updateStatus(STATUS_MESSAGES.error);
    } finally {
      this.setProcessing(false);
      this.updateUndoAvailability();
    }
  }

  updateUndoAvailability() {
    if (!this.undoButton) return;

    const canUndo = Boolean(this.state.lastEntry);
    this.undoButton.disabled = !canUndo || this.isProcessing;
  }

  handleModeChange(event) {
    if (this.isProcessing) {
      if (this.modeField) {
        this.modeField.value = this.getModeValue();
      }
      return;
    }

    const nextMode = this.getModeValue();
    this.setMode(nextMode);
  }

  setMode(mode, { persist = true, announce = true } = {}) {
    const normalized = mode === 'set' ? 'set' : 'add';

    if (this.modeField) {
      this.modeField.value = normalized;
    }

    if (this.countField) {
      if (normalized === 'set') {
        this.countField.value = String(this.state.totalWords || 0);
      } else if (!this.isProcessing) {
        this.countField.value = '';
      }
    }

    if (persist) {
      this.persistMode(normalized);
    }

    if (announce) {
      this.updateStatus(normalized === 'set' ? STATUS_MESSAGES.modeSet : STATUS_MESSAGES.modeAdd);
    }
  }

  getModeValue() {
    if (!this.modeField) return 'add';
    return this.modeField.value === 'set' ? 'set' : 'add';
  }

  loadPersistedMode() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    try {
      const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
      return stored === 'set' ? 'set' : stored === 'add' ? 'add' : null;
    } catch (error) {
      console.warn('Unable to read word entry mode from storage.', error);
      return null;
    }
  }

  persistMode(mode) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch (error) {
      console.warn('Unable to persist word entry mode.', error);
    }
  }

  async quickSubmit(mode, rawValue) {
    if (this.isProcessing) {
      throw new Error('Please wait for the current update to finish.');
    }

    const normalized = mode === 'set' ? 'set' : 'add';
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) {
      this.updateStatus(STATUS_MESSAGES.invalidNumber);
      throw new Error(STATUS_MESSAGES.invalidNumber);
    }

    this.setMode(normalized, { persist: true, announce: false });

    if (normalized === 'add') {
      if (numeric === 0) {
        this.updateStatus(STATUS_MESSAGES.zeroDelta);
        throw new Error(STATUS_MESSAGES.zeroDelta);
      }
      await this.processAddMode(numeric);
      return;
    }

    if (numeric < 0) {
      this.updateStatus(STATUS_MESSAGES.negativeTotal);
      throw new Error(STATUS_MESSAGES.negativeTotal);
    }

    await this.processSetMode(numeric);
  }

  async processAddMode(rawValue) {
    if (rawValue === 0) {
      this.updateStatus(STATUS_MESSAGES.zeroDelta);
      return;
    }

    this.setProcessing(true);
    this.updateStatus(STATUS_MESSAGES.saving);

    try {
      const result = await this.store.addWords(rawValue);
      this.state.totalWords = result.total;
      this.state.lastEntry = result.entry;

      const verb = rawValue >= 0 ? 'Added' : 'Removed';
      this.updateStatus(
        `${verb} ${formatNumber(Math.abs(rawValue))} words. Total: ${formatNumber(this.state.totalWords)}.`
      );

      if (this.countField) {
        this.countField.value = '';
      }
    } catch (error) {
      console.error('Failed to add words.', error);
      this.updateStatus(STATUS_MESSAGES.error);
    } finally {
      this.setProcessing(false);
      this.updateUndoAvailability();
    }
  }

  async processSetMode(rawValue) {
    if (rawValue < 0) {
      this.updateStatus(STATUS_MESSAGES.negativeTotal);
      this.focusInput();
      return;
    }

    const previousTotal = this.state.totalWords;
    const desiredTotal = clampToZero(rawValue);

    if (desiredTotal === previousTotal) {
      this.updateStatus('Total unchanged.');
      return;
    }

    this.setProcessing(true);
    this.updateStatus(STATUS_MESSAGES.saving);

    try {
      const result = await this.store.setTotal(desiredTotal);
      if (!result.entry) {
        this.updateStatus('Total unchanged.');
        return;
      }

      this.state.totalWords = result.total;
      this.state.lastEntry = result.entry;

      const delta = result.entry.delta;
      const direction = delta >= 0 ? 'Increased' : 'Decreased';
      this.updateStatus(
        `${direction} total to ${formatNumber(this.state.totalWords)} words (${delta >= 0 ? '+' : '-'}${formatNumber(Math.abs(delta))}).`
      );

      if (this.countField) {
        this.countField.value = '';
      }
    } catch (error) {
      console.error('Failed to set total.', error);
      this.updateStatus(STATUS_MESSAGES.error);
    } finally {
      this.setProcessing(false);
      this.updateUndoAvailability();
    }
  }
}

export const initWordEntry = () => {
  const root = document.querySelector('[data-word-entry]');
  if (!root) {
    return null;
  }

  const controller = new WordEntryController({
    root,
    form: root.querySelector('[data-word-entry-form]'),
    modeField: root.querySelector('[data-entry-mode]'),
    countField: root.querySelector('[data-word-count]'),
    statusField: root.querySelector('[data-entry-status]'),
    updateButton: root.querySelector('[data-update-button]'),
    undoButton: root.querySelector('[data-undo-button]')
  });

  controller.init();
  return controller;
};
