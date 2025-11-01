export class QuickAddModalController {
  constructor({
    modal,
    triggers = [],
    input,
    submitButton,
    dismissElements = [],
    errorField,
    form,
    modeSelect,
    onSubmit,
    getPrefillValue,
    onModeChange
  } = {}) {
    this.modal = modal;
    this.triggers = [];
    this.input = input;
    this.submitButton = submitButton;
    this.dismissElements = Array.isArray(dismissElements) ? dismissElements : [];
    this.errorField = errorField;
    this.form = form || null;
    this.modeSelect = modeSelect || null;
    this.onSubmit = typeof onSubmit === 'function' ? onSubmit : null;
    this.getPrefillValue = typeof getPrefillValue === 'function' ? getPrefillValue : null;
    this.onModeChangeCallback = typeof onModeChange === 'function' ? onModeChange : null;
    this.previouslyFocused = null;
    this.isProcessing = false;

    this.handleTrigger = this.open.bind(this);
    this.handleDismiss = this.close.bind(this);
    this.handleKeydown = this.onKeydown.bind(this);
    this.handleSubmit = this.submit.bind(this);
    this.handleInputKeydown = this.onInputKeydown.bind(this);
    this.handleModeChange = this.onModeChange.bind(this);

    this.bindStaticEvents();
    this.setTriggers(triggers);
  }

  bindStaticEvents() {
    this.dismissElements.forEach((el) => {
      el?.addEventListener('click', this.handleDismiss);
    });
    if (this.submitButton) {
      this.submitButton.addEventListener('click', this.handleSubmit);
    }
    if (this.form) {
      this.form.addEventListener('submit', this.handleSubmit);
    }
    if (this.input) {
      this.input.addEventListener('keydown', this.handleInputKeydown);
    }
    if (this.modeSelect) {
      this.modeSelect.addEventListener('change', this.handleModeChange);
    }
  }

  unbindStaticEvents() {
    this.dismissElements.forEach((el) => {
      el?.removeEventListener('click', this.handleDismiss);
    });
    if (this.submitButton) {
      this.submitButton.removeEventListener('click', this.handleSubmit);
    }
    if (this.form) {
      this.form.removeEventListener('submit', this.handleSubmit);
    }
    if (this.input) {
      this.input.removeEventListener('keydown', this.handleInputKeydown);
    }
    if (this.modeSelect) {
      this.modeSelect.removeEventListener('change', this.handleModeChange);
    }
  }

  setTriggers(triggers = []) {
    this.triggers.forEach((trigger) => {
      trigger?.removeEventListener('click', this.handleTrigger);
    });
    this.triggers = Array.isArray(triggers) ? triggers : [];
    this.triggers.forEach((trigger) => {
      trigger?.addEventListener('click', this.handleTrigger);
    });
  }

  onInputKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.submit();
    }
  }

  onModeChange() {
    this.clearError();
    const mode = this.modeSelect ? this.modeSelect.value : 'add';
    this.applyPrefill(this.getPrefillValue ? this.getPrefillValue(mode) : null, mode);
    if (this.onModeChangeCallback) {
      this.onModeChangeCallback(mode);
    }
  }

  applyPrefill(prefill, mode) {
    if (!this.input) return;
    if (mode !== 'set') {
      this.input.value = '';
      return;
    }
    if (prefill === null || prefill === undefined) {
      this.input.value = '';
      return;
    }
    const numeric = Number(prefill);
    if (Number.isFinite(numeric)) {
      this.input.value = String(numeric);
    } else if (typeof prefill === 'string') {
      this.input.value = prefill;
    } else {
      this.input.value = '';
    }
  }

  open(event) {
    if (event) {
      event.preventDefault();
    }
    if (!this.modal || !this.modal.hasAttribute('hidden')) {
      return;
    }
    this.previouslyFocused = document.activeElement;
    this.modal.removeAttribute('hidden');
    document.addEventListener('keydown', this.handleKeydown);
    this.clearError();
    const mode = this.modeSelect ? this.modeSelect.value : 'add';
    this.applyPrefill(this.getPrefillValue ? this.getPrefillValue(mode) : null, mode);
    if (this.input) {
      this.input.focus();
      this.input.select?.();
    }
  }

  close(event) {
    if (event) {
      event.preventDefault();
    }
    if (!this.modal || this.modal.hasAttribute('hidden')) {
      return;
    }
    if (this.isProcessing) return;
    this.modal.setAttribute('hidden', '');
    document.removeEventListener('keydown', this.handleKeydown);
    this.clearError();
    if (this.input) {
      this.input.value = '';
    }
    const target = this.previouslyFocused;
    this.previouslyFocused = null;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  onKeydown(event) {
    if (event.key === 'Escape') {
      this.close(event);
    }
  }

  setProcessing(flag) {
    this.isProcessing = Boolean(flag);
    if (this.submitButton) {
      this.submitButton.disabled = this.isProcessing;
    }
    if (this.input) {
      this.input.disabled = this.isProcessing;
    }
  }

  setError(message) {
    if (this.errorField) {
      this.errorField.textContent = message || '';
    }
  }

  clearError() {
    this.setError('');
  }

  async submit(event) {
    if (event) {
      event.preventDefault();
    }
    if (this.isProcessing) {
      return;
    }
    if (!this.onSubmit) {
      this.close();
      return;
    }

    this.clearError();

    const value = this.input ? this.input.value.trim() : '';
    if (!value) {
      this.setError('Enter a number.');
      if (this.input) {
        this.input.focus();
      }
      return;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      this.setError('Enter a valid number.');
      if (this.input) {
        this.input.focus();
        this.input.select?.();
      }
      return;
    }

    const mode = this.modeSelect ? this.modeSelect.value : 'add';

    let shouldClose = false;
    try {
      this.setProcessing(true);
      await this.onSubmit({
        value: numeric,
        mode: mode === 'set' ? 'set' : 'add'
      });
      shouldClose = true;
    } catch (error) {
      const message =
        error?.message && typeof error.message === 'string'
          ? error.message
          : 'Unable to add words. Please try again.';
      this.setError(message);
      if (this.input) {
        this.input.focus();
        this.input.select?.();
      }
    } finally {
      this.setProcessing(false);
      if (shouldClose) {
        this.close();
      }
    }
  }

  destroy() {
    this.close();
    this.setTriggers([]);
    this.unbindStaticEvents();
    this.triggers = [];
    this.dismissElements = [];
    this.form = null;
    this.modeSelect = null;
    this.getPrefillValue = null;
    this.onModeChangeCallback = null;
  }
}

export const initQuickAddModal = (options = {}) => new QuickAddModalController(options);

export default initQuickAddModal;
