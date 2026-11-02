import { formatNumber } from './stats.js';
import { startOfDay, diffInDays } from './date-utils.js';

// Cumulative words by day of a past project (index 0 = its start date).
// Entries logged before the start or after the end count toward the first or last day.
export const buildDayTotals = (project, rows = []) => {
  const start = startOfDay(project?.startDate);
  const end = startOfDay(project?.endDate);
  if (!start || !end || end < start) return [];

  const perDay = new Array(diffInDays(end, start) + 1).fill(0);
  rows.forEach((row) => {
    const delta = Number(row.delta);
    if (!Number.isFinite(delta)) return;
    const index = Math.min(Math.max(diffInDays(row.entry_date, start), 0), perDay.length - 1);
    perDay[index] += delta;
  });

  let running = 0;
  return perDay.map((words) => {
    running += words;
    return running;
  });
};

// "Last year" when the past project started the year before this one; otherwise its name and year.
// `legend` labels the graph line; `lead` starts the sentence under the graph.
export const describePastProject = (past, current) => {
  const pastYear = Number(String(past?.startDate || '').slice(0, 4));
  const currentYear = Number(String(current?.startDate || '').slice(0, 4));
  if (pastYear && currentYear && pastYear === currentYear - 1) {
    return { legend: 'Last year', lead: 'Last year' };
  }
  const name = past?.name || 'Last project';
  const legend = pastYear ? `${name} (${pastYear})` : name;
  return { legend, lead: `In ${legend}` };
};

// Last year's total on the same day of the project, carried flat past its final day.
export const totalOnDay = (dayTotals, dayIndex) => {
  if (!dayTotals?.length || dayIndex < 0) return null;
  return dayTotals[Math.min(dayIndex, dayTotals.length - 1)];
};

export const describeComparison = ({ lead, dayTotals, dayIndex, totalDays, currentTotal }) => {
  const finalTotal = dayTotals[dayTotals.length - 1];
  if (dayIndex < 0 || dayIndex >= totalDays) {
    return `${lead} you finished with ${formatNumber(finalTotal)} words.`;
  }
  const then = totalOnDay(dayTotals, dayIndex);
  const diff = currentTotal - then;
  const standing =
    diff > 0
      ? `You’re ${formatNumber(diff)} ahead.`
      : diff < 0
        ? `You’re ${formatNumber(-diff)} behind.`
        : 'You’re exactly even.';
  return `${lead} on day ${dayIndex + 1} you had ${formatNumber(then)} words. ${standing}`;
};
