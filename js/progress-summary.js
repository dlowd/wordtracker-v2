const PACE_CLASS_MAP = {
  ahead: 'progress-summary__pace--ahead',
  behind: 'progress-summary__pace--behind',
  complete: 'progress-summary__pace--complete',
  'on-track': '',
  before: ''
};

export class ProgressSummaryController {
  constructor({ root, percentageEl, barEl, wordsEl, paceEl }) {
    this.root = root;
    this.percentageEl = percentageEl;
    this.barEl = barEl;
    this.wordsEl = wordsEl;
    this.paceEl = paceEl;
    this.currentPaceClass = '';
  }

  setProgress({ percentage, wordsLabel, paceLabel, paceState }) {
    if (this.percentageEl) {
      this.percentageEl.textContent = percentage;
    }

    if (this.barEl) {
      const numericPercent = Number.parseFloat(
        typeof percentage === 'string' ? percentage.replace('%', '') : percentage
      );
      const safePercentage = Number.isFinite(numericPercent)
        ? Math.max(Math.min(numericPercent, 200), 0)
        : 0;
      this.barEl.style.width = `${safePercentage}%`;
    }

    if (this.wordsEl) {
      this.wordsEl.textContent = wordsLabel;
    }

    if (this.paceEl) {
      if (this.currentPaceClass) {
        this.paceEl.classList.remove(this.currentPaceClass);
        this.currentPaceClass = '';
      }

      const nextClass = PACE_CLASS_MAP[paceState] || '';
      if (nextClass) {
        this.paceEl.classList.add(nextClass);
        this.currentPaceClass = nextClass;
      }

      this.paceEl.textContent = paceLabel;
    }
  }
}

export const initProgressSummary = () => {
  const root = document.querySelector('[data-progress-summary]') || document.querySelector('.progress-summary');
  if (!root) return null;

  const controller = new ProgressSummaryController({
    root,
    percentageEl: root.querySelector('[data-progress-percentage]'),
    barEl: root.querySelector('[data-progress-bar]'),
    wordsEl: root.querySelector('[data-progress-words]'),
    paceEl: root.querySelector('[data-progress-pace]')
  });

  return controller;
};

export default initProgressSummary;
