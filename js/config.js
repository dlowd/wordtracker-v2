export const FEATURES = Object.freeze({
  newLayout: true, // Phase 1
  newWordEntry: true, // Phase 2
  newProgressSummary: true, // Phase 3
  customizableStats: true, // Phase 4
  rewardsSystem: true, // Phase 5
  bookComparisons: true, // Phase 6
  quickStatsBar: true,
  quickAddModal: true
});

export const isFeatureEnabled = (flag) => Boolean(FEATURES[flag]);

export default FEATURES;
