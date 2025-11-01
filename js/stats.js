import { startOfDay, diffInDays, getDateKey, addDays } from './date-utils.js';

const buildDailyTotals = (entries = []) => {
  if (!entries?.length) return [];
  const totals = new Map();
  entries.forEach((entry) => {
    const key = getDateKey(entry?.timestamp);
    if (!key) return;
    const previous = totals.get(key) || 0;
    const delta = Number.isFinite(entry?.delta) ? entry.delta : 0;
    totals.set(key, previous + delta);
  });

  let runningTotal = 0;
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, delta]) => {
      runningTotal += delta;
      return {
        date,
        delta,
        cumulative: runningTotal
      };
    });
};

const formatNumber = (value) => new Intl.NumberFormat().format(Math.round(value));

const formatSignedNumber = (value) => {
  const abs = formatNumber(Math.abs(value));
  return value < 0 ? `-${abs}` : abs;
};

const formatPercentage = (value) => `${Math.round(value)}%`;

const getUniqueEntryDaysCount = (entries) => {
  if (!entries?.length) return 0;
  const dayKeys = new Set(
    entries
      .map((entry) => getDateKey(entry?.timestamp))
      .filter(Boolean)
  );
  return dayKeys.size;
};

const calculateDayPhase = (project, today = new Date()) => {
  const start = startOfDay(project?.startDate);
  const end = startOfDay(project?.endDate);
  const todayStart = startOfDay(today);

  if (!start || !end || !todayStart || end < start) {
    return {
      phase: 'unknown',
      totalDays: 0,
      dayNumber: 0,
      daysUntilStart: 0,
      daysRemaining: 0
    };
  }

  const totalDays = diffInDays(end, start) + 1;

  if (todayStart < start) {
    const daysUntilStart = Math.max(diffInDays(start, todayStart), 0);
    return {
      phase: 'before',
      totalDays,
      dayNumber: 0,
      daysUntilStart,
      daysRemaining: totalDays
    };
  }

  if (todayStart > end) {
    return {
      phase: 'after',
      totalDays,
      dayNumber: totalDays,
      daysUntilStart: 0,
      daysRemaining: 0
    };
  }

  const dayNumber = diffInDays(todayStart, start) + 1;
  const daysRemaining = Math.max(totalDays - dayNumber, 0);

  return {
    phase: 'active',
    totalDays,
    dayNumber,
    daysUntilStart: 0,
    daysRemaining
  };
};

const getWordsToday = (entries, today = new Date()) => {
  if (!entries?.length) return 0;
  const todayKey = getDateKey(today);
  return entries.reduce((sum, entry) => {
    const entryKey = getDateKey(entry?.timestamp);
    if (entryKey && entryKey === todayKey) {
      return sum + (Number.isFinite(entry?.delta) ? entry.delta : 0);
    }
    return sum;
  }, 0);
};

export const computeProjectMetrics = (snapshot, project, today = new Date()) => {
  const totalWords = Number.isFinite(snapshot?.total) ? snapshot.total : 0;
  const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : [];

  const dayPhase = calculateDayPhase(project, today);
  const wordsToday = getWordsToday(entries, today);
  const goalWords = Number.isFinite(project?.goal) && project.goal > 0 ? project.goal : 50000;
  const wordsRemainingRaw = goalWords - totalWords;
  const wordsRemaining = wordsRemainingRaw;
  const percentage = goalWords > 0 ? (totalWords / goalWords) * 100 : 0;

  let requirementDays;
  if (dayPhase.phase === 'before') {
    requirementDays = dayPhase.totalDays;
  } else if (dayPhase.phase === 'after') {
    requirementDays = 1;
  } else {
    requirementDays = Math.max(dayPhase.totalDays - dayPhase.dayNumber + 1, 1);
  }

  const remainingForRequirement = Math.max(wordsRemainingRaw, 0);
  const wordsPerDayRequired =
    requirementDays > 0 ? Math.ceil(remainingForRequirement / Math.max(requirementDays-1, 1)) : 0;

  const paceDenominator = dayPhase.totalDays > 0 ? dayPhase.totalDays : requirementDays;
  const dailyPace = paceDenominator > 0 ? goalWords / paceDenominator : 0;
  let activeDayNumber = 0;
  if (dayPhase.phase === 'active') {
    activeDayNumber = dayPhase.dayNumber;
  } else if (dayPhase.phase === 'after') {
    activeDayNumber = dayPhase.totalDays;
  } else {
    activeDayNumber = 0;
  }
  const expectedWords = activeDayNumber > 0 ? Math.round(dailyPace * activeDayNumber) : 0;
  const paceDeltaWords = totalWords - expectedWords;
  const daysAheadBehind = dailyPace > 0 ? Math.round(paceDeltaWords / dailyPace) : 0;

  const dailyTotals = buildDailyTotals(entries);

  const uniqueEntryDays = getUniqueEntryDaysCount(entries);
  let averageWordsPerDay = 0;
  if (totalWords > 0) {
    const projectStart = startOfDay(project?.startDate);
    const todayStart = startOfDay(today);
    if (projectStart && todayStart && todayStart >= projectStart) {
      const projectEnd = startOfDay(project?.endDate);
      let effectiveEnd = todayStart;
      if (projectEnd && todayStart > projectEnd) {
        effectiveEnd = projectEnd;
      }
      const daysElapsed = diffInDays(effectiveEnd, projectStart) + 1;
      if (daysElapsed > 0) {
        averageWordsPerDay = Math.round(totalWords / daysElapsed);
      }
    } else if (uniqueEntryDays > 0) {
      // Fallback for edge cases (e.g., entries before project start defined)
      averageWordsPerDay = Math.round(totalWords / uniqueEntryDays);
    }
  }

  const baselineDailyGoal =
    dayPhase.totalDays > 0 ? Math.ceil(goalWords / dayPhase.totalDays) : goalWords;

  let bestDayWords = 0;
  let bestDayNumber = null;
  if (dailyTotals.length) {
    const projectStart = startOfDay(project?.startDate);
    dailyTotals.forEach((day) => {
      const dayWords = day.delta;
      if (dayWords > bestDayWords) {
        bestDayWords = dayWords;
        const dayDate = startOfDay(day.date);
        const dayIndex = projectStart ? Math.max(diffInDays(dayDate, projectStart), 0) + 1 : null;
        bestDayNumber = dayIndex;
      }
    });
  }

  let currentStreak = 0;
  if (dailyTotals.length && baselineDailyGoal > 0) {
    const projectStart = startOfDay(project?.startDate);
    const dayMap = new Map(dailyTotals.map((day) => [day.date, day.delta]));
    const lastEntryDate = startOfDay(dailyTotals[dailyTotals.length - 1].date);
    let cursor = lastEntryDate;
    while (cursor && projectStart && cursor >= projectStart) {
      const key = getDateKey(cursor);
      const words = dayMap.get(key) || 0;
      if (words >= baselineDailyGoal) {
        currentStreak += 1;
        cursor = addDays(cursor, -1);
      } else {
        break;
      }
    }
  }

  let projectedFinishDate = null;
  if (totalWords >= goalWords) {
    projectedFinishDate = startOfDay(today);
  } else if (totalWords > 0) {
    const daysElapsed =
      dayPhase.phase === 'active' ? dayPhase.dayNumber : dailyTotals.length;
    const averagePerDay = daysElapsed > 0 ? totalWords / daysElapsed : 0;
    if (averagePerDay > 0) {
      const daysNeeded = Math.ceil(Math.max(goalWords - totalWords, 0) / averagePerDay);
      const finish = startOfDay(today);
      if (finish) {
        finish.setDate(finish.getDate() + daysNeeded);
        projectedFinishDate = finish;
      }
    }
  }

  let dateString;
  const now = new Date;
  dateString = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

  let headerLabel;
  if (dayPhase.phase === 'before') {
    const days = dayPhase.daysUntilStart || 0;
    const plural = days === 1 ? '' : 's';
    headerLabel = `Starts in ${days} day${plural}`;
  } else if (dayPhase.phase === 'after') {
    headerLabel = 'Project complete';
  } else if (dayPhase.phase === 'unknown') {
    headerLabel = 'Project';
  } else {
    headerLabel = `Day ${dayPhase.dayNumber} of ${dayPhase.totalDays}`;
  }

  let paceLabel = 'On track ✓';
  let paceState = 'on-track';
  if (dayPhase.phase === 'before') {
    const days = dayPhase.daysUntilStart || 0;
    const plural = days === 1 ? '' : 's';
    paceLabel = days > 0 ? `Project starts in ${days} day${plural}` : 'Project starting soon';
    paceState = 'before';
  } else if (dayPhase.phase === 'after') {
    paceLabel = 'Goal period complete';
    paceState = 'complete';
  } else if (paceDeltaWords > 0) {
    paceLabel = `${formatNumber(Math.abs(daysAheadBehind))} day${Math.abs(daysAheadBehind) === 1 ? '' : 's'} ahead ✓`;
    paceState = 'ahead';
  } else if (paceDeltaWords < 0) {
    paceLabel = `${formatNumber(Math.abs(daysAheadBehind))} day${Math.abs(daysAheadBehind) === 1 ? '' : 's'} behind`;
    paceState = 'behind';
  }

  const highlightToday =
    dayPhase.phase === 'active' && wordsToday >= wordsPerDayRequired && wordsPerDayRequired > 0;

  return {
    totalWords,
    wordsToday,
    wordsRemaining,
    wordsPerDayRequired,
    averageWordsPerDay,
    percentage,
    progressPercentage: percentage,
    goalWords,
    expectedWords,
    paceDeltaWords,
    daysAheadBehind,
    dailyPace,
    paceState,
    paceLabel,
    requirementDays,
    highlightToday,
    dayPhase,
    dateString,
    headerLabel,
    baselineDailyGoal,
    bestDayWords,
    bestDayNumber,
    currentStreak,
    projectedFinishDate,
    dailyTotals
  };
};

export const formatMetricsForDisplay = (metrics) => {
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  let projectedFinish = null;
  if (metrics.wordsRemaining <= 0) {
    projectedFinish = 'Goal achieved!';
  } else if (metrics.projectedFinishDate && metrics.projectedFinishDate instanceof Date) {
    projectedFinish = dateFormatter.format(metrics.projectedFinishDate);
  }

  const bestDayDisplay =
    metrics.bestDayWords > 0 && metrics.bestDayNumber
      ? `${formatNumber(metrics.bestDayWords)} (Day ${metrics.bestDayNumber})`
      : '—';

  const streakDisplay =
    metrics.currentStreak > 0
      ? `${metrics.currentStreak} day${metrics.currentStreak === 1 ? '' : 's'}`
      : '0 days';

  return {
    wordsPerDayRequired: metrics.wordsPerDayRequired > 0 ? formatNumber(metrics.wordsPerDayRequired) : '—',
    wordsToday: formatSignedNumber(metrics.wordsToday),
    totalWords: formatNumber(metrics.totalWords),
    percentage: formatPercentage(metrics.percentage),
    averageWordsPerDay:
      metrics.averageWordsPerDay > 0 ? formatNumber(metrics.averageWordsPerDay) : '—',
    wordsRemaining: formatSignedNumber(metrics.wordsRemaining),
    goalWords: formatNumber(metrics.goalWords),
    progressWordsLabel: `${formatNumber(metrics.totalWords)} / ${formatNumber(metrics.goalWords)}`,
    paceLabel: metrics.paceLabel,
    paceState: metrics.paceState,
    bestDay: bestDayDisplay,
    currentStreak: streakDisplay,
    projectedFinish: projectedFinish || '—'
  };
};

export { formatNumber, formatSignedNumber, formatPercentage, buildDailyTotals };

export default computeProjectMetrics;
