export class SettingsModal {
  constructor(options = {}) {
    const {
      modal,
      triggers = [],
      onStatToggle,
      onProjectSubmit,
      onFeatureToggle,
      onThemeChange,
      initialTheme = 'classic'
    } = options;

    this.modal = modal;
    this.triggers = triggers;
    this.onStatToggle = onStatToggle;
    this.onProjectSubmit = onProjectSubmit;
    this.onFeatureToggle = onFeatureToggle;
    this.onThemeChange = onThemeChange;
    this.dismissElements = Array.from(
      modal?.querySelectorAll('[data-settings-dismiss]') ?? []
    );
    this.statCheckboxes = Array.from(
      modal?.querySelectorAll('[data-stat-toggle]') ?? []
    );
    this.featureCheckboxes = Array.from(
      modal?.querySelectorAll('[data-feature-toggle]') ?? []
    );
    this.themeSelect = modal?.querySelector('[data-theme-select]') ?? null;
    this.projectForm = modal?.querySelector('[data-project-form]') ?? null;
    this.projectNameInput = modal?.querySelector('[data-project-name]') ?? null;
    this.projectStartInput = modal?.querySelector('[data-project-start]') ?? null;
    this.projectEndInput = modal?.querySelector('[data-project-end]') ?? null;
    this.projectGoalInput = modal?.querySelector('[data-project-goal]') ?? null;
    this.projectFeedback = modal?.querySelector('[data-project-feedback]') ?? null;
    this.projectFeedbackTimeout = null;
    this.projectSnapshot = null;
    this.themeValue = initialTheme;

    this.isOpen = false;
    this.previouslyFocused = null;

    this.handleTriggerClick = this.open.bind(this);
    this.handleDismiss = this.close.bind(this);
    this.handleKeydown = this.onKeydown.bind(this);
    this.handleCheckboxChange = this.onCheckboxChange.bind(this);
    this.handleFeatureChange = this.onFeatureChange.bind(this);
    this.handleProjectSubmit = this.onProjectFormSubmit.bind(this);
    this.handleThemeChange = this.onThemeSelectChange.bind(this);

    this.bindEvents();
  }

  bindEvents() {
    this.triggers.forEach((trigger) =>
      trigger.addEventListener('click', this.handleTriggerClick)
    );
    this.dismissElements.forEach((el) =>
      el.addEventListener('click', this.handleDismiss)
    );
    this.statCheckboxes.forEach((checkbox) =>
      checkbox.addEventListener('change', this.handleCheckboxChange)
    );
    this.featureCheckboxes.forEach((checkbox) =>
      checkbox.addEventListener('change', this.handleFeatureChange)
    );
    if (this.themeSelect) {
      this.themeSelect.addEventListener('change', this.handleThemeChange);
    }
    if (this.projectForm) {
      this.projectForm.addEventListener('submit', this.handleProjectSubmit);
    }
  }

  unbindEvents() {
    this.triggers.forEach((trigger) =>
      trigger.removeEventListener('click', this.handleTriggerClick)
    );
    this.dismissElements.forEach((el) =>
      el.removeEventListener('click', this.handleDismiss)
    );
    this.statCheckboxes.forEach((checkbox) =>
      checkbox.removeEventListener('change', this.handleCheckboxChange)
    );
    this.featureCheckboxes.forEach((checkbox) =>
      checkbox.removeEventListener('change', this.handleFeatureChange)
    );
    if (this.themeSelect) {
      this.themeSelect.removeEventListener('change', this.handleThemeChange);
    }
    if (this.projectForm) {
      this.projectForm.removeEventListener('submit', this.handleProjectSubmit);
    }
  }

  open(event) {
    if (event) {
      event.preventDefault();
    }
    if (!this.modal || this.isOpen) {
      return;
    }

    this.previouslyFocused = document.activeElement;
    this.modal.removeAttribute('hidden');
    document.addEventListener('keydown', this.handleKeydown);
    this.isOpen = true;

    if (this.projectSnapshot) {
      this.populateProjectInputs(this.projectSnapshot);
    }

    if (this.themeSelect) {
      this.themeSelect.value = this.themeValue;
    }

    const title = this.modal.querySelector('#settings-modal-title');
    if (title) {
      title.focus();
    }
  }

  close(event) {
    if (event) {
      event.preventDefault();
    }
    if (!this.modal || !this.isOpen) {
      return;
    }

    this.modal.setAttribute('hidden', '');
    document.removeEventListener('keydown', this.handleKeydown);
    this.isOpen = false;

    if (this.projectFeedback) {
      this.projectFeedback.textContent = '';
    }
    clearTimeout(this.projectFeedbackTimeout);

    if (this.previouslyFocused && typeof this.previouslyFocused.focus === 'function') {
      this.previouslyFocused.focus();
    }
    this.previouslyFocused = null;
  }

  onKeydown(event) {
    if (event.key === 'Escape') {
      this.close(event);
    }
  }

  onCheckboxChange(event) {
    const checkbox = event.target;
    if (!checkbox || !checkbox.dataset.statToggle) return;

    if (typeof this.onStatToggle === 'function') {
      this.onStatToggle(checkbox.dataset.statToggle, checkbox.checked);
    }
  }

  onFeatureChange(event) {
    const checkbox = event.target;
    if (!checkbox || !checkbox.dataset.featureToggle) return;

    if (typeof this.onFeatureToggle === 'function') {
      this.onFeatureToggle(checkbox.dataset.featureToggle, checkbox.checked);
    }
  }

  onThemeSelectChange(event) {
    const { value } = event.target;
    this.themeValue = value;
    if (typeof this.onThemeChange === 'function') {
      this.onThemeChange(value);
    }
  }

  setStatToggle(id, enabled) {
    const checkbox = this.statCheckboxes.find(
      (cb) => cb.dataset.statToggle === id
    );
    if (!checkbox) return;
    checkbox.checked = Boolean(enabled);
  }

  setFeatureToggle(id, enabled) {
    const checkbox = this.featureCheckboxes.find(
      (cb) => cb.dataset.featureToggle === id
    );
    if (!checkbox) return;
    checkbox.checked = Boolean(enabled);
  }

  setTheme(theme) {
    this.themeValue = theme;
    if (this.themeSelect) {
      this.themeSelect.value = theme;
    }
  }

  setProject(project) {
    this.projectSnapshot = { ...(project || {}) };
    if (this.isOpen) {
      this.populateProjectInputs(this.projectSnapshot);
    }
  }

  populateProjectInputs(project) {
    if (!project) return;
    if (this.projectNameInput) {
      this.projectNameInput.value = project.name || '';
    }
    if (this.projectStartInput) {
      this.projectStartInput.value = project.startDate || '';
    }
    if (this.projectEndInput) {
      this.projectEndInput.value = project.endDate || '';
    }
    if (this.projectGoalInput) {
      this.projectGoalInput.value = project.goal || '';
    }
  }

  onProjectFormSubmit(event) {
    event.preventDefault();
    if (typeof this.onProjectSubmit !== 'function') {
      return;
    }

    const payload = {
      name: this.projectNameInput ? this.projectNameInput.value.trim() : '',
      startDate: this.projectStartInput ? this.projectStartInput.value : '',
      endDate: this.projectEndInput ? this.projectEndInput.value : '',
      goal: this.projectGoalInput ? Number(this.projectGoalInput.value) : 0
    };

    const feedback = this.onProjectSubmit(payload);
    this.showProjectFeedback(feedback);
  }

  showProjectFeedback(feedback) {
    if (!this.projectFeedback) return;
    const message = feedback?.message || 'Project updated.';
    const isError = feedback && feedback.success === false;
    this.projectFeedback.textContent = message;
    this.projectFeedback.classList.toggle('settings-form-feedback--error', Boolean(isError));
    clearTimeout(this.projectFeedbackTimeout);
    this.projectFeedbackTimeout = setTimeout(() => {
      if (this.projectFeedback) {
        this.projectFeedback.textContent = '';
        this.projectFeedback.classList.remove('settings-form-feedback--error');
      }
    }, 3000);
  }

  getSelectedStats() {
    return this.statCheckboxes.reduce((acc, checkbox) => {
      if (checkbox.dataset.statToggle) {
        acc[checkbox.dataset.statToggle] = checkbox.checked;
      }
      return acc;
    }, {});
  }

  getSelectedFeatures() {
    return this.featureCheckboxes.reduce((acc, checkbox) => {
      if (checkbox.dataset.featureToggle) {
        acc[checkbox.dataset.featureToggle] = checkbox.checked;
      }
      return acc;
    }, {});
  }

  destroy() {
    this.unbindEvents();
    document.removeEventListener('keydown', this.handleKeydown);
    this.statCheckboxes = [];
    this.featureCheckboxes = [];
    this.themeSelect = null;
    this.triggers = [];
    this.dismissElements = [];
    clearTimeout(this.projectFeedbackTimeout);
  }
}

export const initSettingsModal = ({
  onStatToggle,
  onProjectSubmit,
  onFeatureToggle,
  onThemeChange,
  initialTheme
} = {}) => {
  const modal = document.querySelector('[data-settings-modal]');
  if (!modal) return null;

  const triggers = Array.from(document.querySelectorAll('[data-settings-trigger]'));

  return new SettingsModal({
    modal,
    triggers,
    onStatToggle,
    onProjectSubmit,
    onFeatureToggle,
    onThemeChange,
    initialTheme
  });
};

export default initSettingsModal;
