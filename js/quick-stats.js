import { formatNumber, formatSignedNumber } from './stats.js';

const pluralize = (value, singular, plural = `${singular}s`) => {
  const abs = Math.abs(value);
  return abs === 1 ? singular : plural;
};

export class QuickStatsController {
  constructor({ root } = {}) {
    this.root = root;
    this.enabled = false;
    this.lastMetrics = null;
    this.dateFormatter = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
    if (!this.root) return;
    if (!this.enabled) {
      this.root.setAttribute('hidden', '');
    } else {
      this.update(this.lastMetrics);
    }
  }

  update(metrics) {
    this.lastMetrics = metrics;
    if (!this.root) return;

    if (!this.enabled || !metrics) {
      this.root.setAttribute('hidden', '');
      return;
    }

    const markup = this.buildMarkup(metrics);
    if (!markup) {
      this.root.setAttribute('hidden', '');
      this.root.textContent = '';
      return;
    }

    this.root.innerHTML = markup;
    this.root.removeAttribute('hidden');
  }

  buildMarkup(metrics) {
    if (!Number.isFinite(metrics.goalWords)) {
      return '';
    }

    const parts = [];
    const goalWords = metrics.goalWords > 0 ? formatNumber(metrics.goalWords) : '—';
    const totalWords = formatNumber(metrics.totalWords);
    parts.push(
      `<span class="quick-stats__label">Total:</span> <span class="quick-stats__value">${totalWords}</span> / <span class="quick-stats__value">${goalWords}</span> words`
    );

    const wordsToday = formatSignedNumber(metrics.wordsToday);
    const wordsRequired =
      metrics.wordsPerDayRequired && metrics.wordsPerDayRequired > 0
        ? formatNumber(metrics.wordsPerDayRequired)
        : null;
    const todayMarkup = wordsRequired
      ? `<span class="quick-stats__label">Today:</span> <span class="quick-stats__value">${wordsToday}</span> / <span class="quick-stats__value">${wordsRequired}</span> words`
      : `<span class="quick-stats__label">Today:</span> <span class="quick-stats__value">${wordsToday}</span> words`;
    parts.push(todayMarkup);

    const paceText = this.getPaceText(metrics);
    if (paceText) {
      parts.push(`<span class="quick-stats__value">${paceText}</span>`);
    }

    parts.push(`<span>${this.dateFormatter.format(new Date())}</span>`);

    const dayLabel = this.getDayLabel(metrics);
    if (dayLabel) {
      parts.push(`<span>${dayLabel}</span>`);
    }

    return parts
      .map((part) => `<span class="quick-stats__item">${part}</span>`)
      .join('<span class="quick-stats__separator">•</span>');
  }

  getPaceText(metrics) {
    if (metrics.dayPhase?.phase === 'before') {
      return 'Not started';
    }
    if (metrics.dayPhase?.phase === 'after') {
      return 'Goal period complete';
    }
    const days = metrics.daysAheadBehind || 0;
    if (days === 0) {
      return 'On pace';
    }
    const absDays = formatNumber(Math.abs(days));
    const label = pluralize(days, 'day');
    return days > 0 ? `${absDays} ${label} ahead` : `${absDays} ${label} behind`;
  }

  getDayLabel(metrics) {
    const phase = metrics.dayPhase;
    if (!phase) return '';
    if (phase.phase === 'active' && phase.totalDays > 0) {
      return `Day ${formatNumber(phase.dayNumber)} of ${formatNumber(phase.totalDays)}`;
    }
    if (phase.phase === 'before') {
      const days = phase.daysUntilStart || 0;
      if (days <= 0) return 'Starts soon';
      return `Starts in ${formatNumber(days)} ${pluralize(days, 'day')}`;
    }
    if (phase.phase === 'after') {
      return 'Project complete';
    }
    if (phase.phase === 'unknown') {
      return 'Timeline TBD';
    }
    return '';
  }

  destroy() {
    this.lastMetrics = null;
    this.setEnabled(false);
  }
}

export const initQuickStats = () => {
  const root = document.querySelector('[data-quick-stats]');
  if (!root) return null;
  return new QuickStatsController({ root });
};

export default initQuickStats;
