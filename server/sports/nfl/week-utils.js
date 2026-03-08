const { WEEK_LABELS, MAX_WEEK, SKIP_WEEKS, REGULAR_SEASON_WEEKS } = require('./constants');

/**
 * Convert app-internal week (1-23) to ESPN API params.
 */
function getEspnWeekParams(week) {
  if (week <= 18) {
    return { espnWeek: week, seasonType: 2 };
  }
  if (week === 23) {
    return { espnWeek: 5, seasonType: 3 }; // Super Bowl
  }
  return { espnWeek: week - 18, seasonType: 3 };
}

/**
 * Get display label for a week number.
 */
function getWeekLabel(week) {
  if (week <= 18) return `Week ${week}`;
  return WEEK_LABELS[week] || `Week ${week}`;
}

/**
 * Validate a week number for a league.
 */
function validateWeek(week, league) {
  const startWeek = league?.start_week || league?.startWeek || 1;
  if (week < startWeek) {
    return { valid: false, error: `Picks start from week ${startWeek}` };
  }
  if (week > MAX_WEEK) {
    return { valid: false, error: `Invalid week. Season ends at Super Bowl (week ${MAX_WEEK})` };
  }
  if (SKIP_WEEKS.includes(week)) {
    return { valid: false, error: `Week ${week} is not available for picks` };
  }
  return { valid: true };
}

/**
 * Get valid start period options.
 */
function getValidStartPeriods() {
  return Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => ({
    value: i + 1,
    label: `Week ${i + 1}`
  }));
}

/**
 * Convert ESPN week + seasonType to app-internal week number.
 */
function espnToAppWeek(espnWeek, seasonType) {
  if (seasonType !== 3) return espnWeek;
  if (espnWeek === 5 || espnWeek === 4) return 23; // Super Bowl (or Pro Bowl -> treat as SB)
  return espnWeek + 18; // WC=19, DIV=20, CONF=21
}

module.exports = { getEspnWeekParams, getWeekLabel, validateWeek, getValidStartPeriods, espnToAppWeek };
