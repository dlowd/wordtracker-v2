import { formatNumber, buildDailyTotals } from './stats.js';
import { startOfDay, diffInDays, getDateKey, addDays } from './date-utils.js';

const buildLabels = (data) => {
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return data.map((dateString) => {
    const [year, month, day] = dateString.split('-').map((part) => Number(part));
    const labelDate = new Date(year, month - 1, day);
    return {
      display: formatter.format(labelDate),
      raw: labelDate
    };
  });
};

const buildTimeline = (project, data) => {
  const fallback = data?.length ? data.map((point) => point.date) : [];
  const start =
    startOfDay(project?.startDate) || (fallback[0] ? startOfDay(fallback[0]) : null);
  const end =
    startOfDay(project?.endDate) ||
    (fallback.length ? startOfDay(fallback[fallback.length - 1]) : null);

  if (!start || !end || end < start) {
    return fallback.filter(Boolean);
  }

  const timeline = [];
  let cursor = start;
  while (cursor && cursor <= end) {
    const key = getDateKey(cursor);
    if (key) {
      timeline.push(key);
    }
    cursor = addDays(cursor, 1);
  }
  return timeline;
};

const buildPaceSeries = (labels, project) => {
  if (!labels.length) return [];
  if (!project || !project.startDate || !project.endDate) {
    return labels.map(() => 0);
  }

  const goal = Number.isFinite(project.goal) && project.goal > 0 ? project.goal : 50000;
  const start = startOfDay(project.startDate);
  const end = startOfDay(project.endDate);
  if (!start || !end) {
    return labels.map(() => 0);
  }
  const totalDays = Math.max(diffInDays(end, start) + 1, 1);

  return labels.map(({ raw }) => {
    const dayIndex = Math.min(Math.max(diffInDays(raw, start), 0), totalDays - 1);
    const ratio = (dayIndex + 1) / totalDays;
    return Math.round(goal * ratio);
  });
};

export class GraphController {
  constructor({ root, canvas, placeholder }) {
    this.root = root;
    this.canvas = canvas;
    this.placeholder = placeholder;
    this.chart = null;
    this.isInitialized = false;
  }

  ensureChart() {
    if (this.chart || !this.canvas || typeof window === 'undefined') {
      return this.chart;
    }
    if (!window.Chart || typeof window.Chart !== 'function') {
      return null;
    }
    const ctx = this.canvas.getContext('2d');

    const hoverLinePlugin = {
      id: 'hoverLine',
      afterDatasetsDraw: (chart) => {
        const activeElements = chart.getActiveElements?.();
        if (!activeElements || !activeElements.length) {
          return;
        }
        const { chartArea, ctx: chartCtx } = chart;
        if (!chartArea || !chartCtx) {
          return;
        }
        const x = activeElements[0].element?.x;
        if (!Number.isFinite(x)) {
          return;
        }
        chartCtx.save();
        chartCtx.beginPath();
        chartCtx.setLineDash([4, 4]);
        chartCtx.moveTo(x, chartArea.top);
        chartCtx.lineTo(x, chartArea.bottom);
        chartCtx.lineWidth = 1;
        chartCtx.strokeStyle = 'rgba(14, 116, 144, 0.4)';
        chartCtx.stroke();
        chartCtx.restore();
      }
    };

    this.chart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Total Words',
            data: [],
            borderColor: '#0e7490',
            backgroundColor: 'rgba(14, 116, 144, 0.15)',
            fill: 'origin',
            tension: 0.3,
            borderWidth: 3,
            pointRadius: 3,
            pointHitRadius: 12,
            spanGaps: true
          },
          {
            label: 'Target',
            data: [],
            borderColor: '#a68968',
            borderDash: [6, 6],
            tension: 0,
            borderWidth: 2,
            pointRadius: 0,
            spanGaps: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
          axis: 'x'
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => formatNumber(value)
            },
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          tooltip: {
            intersect: false,
            mode: 'index',
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const value = formatNumber(context.parsed.y);
                return `${label}: ${value}`;
              }
            }
          }
        }
      },
      plugins: [hoverLinePlugin]
    });
    return this.chart;
  }

  setPlaceholder(message, hint) {
    if (!this.placeholder) return;
    this.placeholder.innerHTML = `
      <p class="graph-visual__message">${message}</p>
      <p class="graph-visual__hint">${hint}</p>
    `;
  }

  update({ snapshot, project }) {
    if (!this.placeholder || !this.root) return;

    const data = buildDailyTotals(snapshot?.entries);
    const timeline = buildTimeline(project, data);

    if (!timeline.length) {
      this.root.classList.remove('graph-visual--active');
      this.setPlaceholder(
        'Start logging words to visualize your progress.',
        'Your daily totals and pace line will appear here once you add entries.'
      );
      return;
    }

    const labels = buildLabels(timeline);
    const paceSeries = buildPaceSeries(labels, project);

    const cumulativeMap = new Map(data.map((point) => [point.date, point.cumulative]));
    const todayKey = getDateKey(new Date());
    let lastValue = 0;
    let latestTotal = 0;
    const totalSeries = timeline.map((dateKey) => {
      if (todayKey && dateKey > todayKey) {
        return null;
      }
      if (cumulativeMap.has(dateKey)) {
        lastValue = cumulativeMap.get(dateKey);
      }
      latestTotal = lastValue;
      return lastValue;
    });

    const chart = this.ensureChart();
    if (!chart) {
      this.root.classList.remove('graph-visual--active');
      this.setPlaceholder(
        `Latest total: ${formatNumber(latestTotal)} words`,
        'Load Chart.js to see the interactive graph.'
      );
      return;
    }

    this.root.classList.add('graph-visual--active');
    chart.data.labels = labels.map((l) => l.display);
    chart.data.datasets[0].data = totalSeries;
    chart.data.datasets[1].data = paceSeries;
    const goalMax = Number.isFinite(project?.goal) ? project.goal : 0;
    const numericTotals = totalSeries.filter((value) => Number.isFinite(value));
    const numericPace = paceSeries.filter((value) => Number.isFinite(value));
    const maxValue = Math.max(
      0,
      goalMax,
      ...(numericTotals.length ? numericTotals : [0]),
      ...(numericPace.length ? numericPace : [0])
    );
    if (chart.options?.scales?.y) {
      chart.options.scales.y.suggestedMax = maxValue;
      chart.options.scales.y.max = maxValue;
    }
    const mode = this.isInitialized ? undefined : 'none';
    chart.update(mode);
    this.isInitialized = true;
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if (this.root) {
      this.root.classList.remove('graph-visual--active');
    }
  }
}

export const initGraph = () => {
  const root = document.querySelector('[data-graph]');
  if (!root) return null;

  const canvas = root.querySelector('[data-graph-canvas]');
  const placeholder = root.querySelector('[data-graph-placeholder]');

  return new GraphController({
    root,
    canvas,
    placeholder
  });
};

export default initGraph;
