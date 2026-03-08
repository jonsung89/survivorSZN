import { WEEK_LABELS, SHORT_WEEK_LABELS, ESPN_PLAYOFF_LABELS } from './constants';

/**
 * Get display label for an app-internal week number (1-23).
 * Optionally accepts ESPN seasonType for ESPN-style week numbers.
 */
export function getWeekLabel(week, seasonType) {
  // Handle ESPN-style (seasonType 3 + week 1-5)
  if (seasonType === 3) {
    return ESPN_PLAYOFF_LABELS[week] || `Playoff Week ${week}`;
  }
  // Handle app-internal week numbers (19-23)
  if (week > 18) {
    return WEEK_LABELS[week] || `Week ${week}`;
  }
  return `Week ${week}`;
}

/**
 * Get short label for compact display (e.g., "WC", "DIV", "SB").
 */
export function getShortWeekLabel(week) {
  if (week <= 18) return String(week);
  return SHORT_WEEK_LABELS[week] || String(week);
}

/**
 * Get full label for a week (e.g., "Week 1", "Wild Card").
 * Uses app-internal week numbers only (no seasonType).
 */
export function getWeekFullLabel(week) {
  if (week <= 18) return `Week ${week}`;
  return WEEK_LABELS[week] || `Week ${week}`;
}

/**
 * Convert app-internal week (1-23) to ESPN API params.
 */
export function getEspnWeekParams(week) {
  if (week <= 18) return { espnWeek: week, seasonType: 2 };
  if (week === 23) return { espnWeek: 5, seasonType: 3 };
  return { espnWeek: week - 18, seasonType: 3 };
}

/**
 * Convert ESPN week + seasonType to app-internal week number.
 */
export function espnToAppWeek(espnWeek, seasonType) {
  if (seasonType !== 3) return espnWeek;
  if (espnWeek === 5) return 23; // Super Bowl
  if (espnWeek === 4) return 23; // Pro Bowl week -> treat as Super Bowl
  return espnWeek + 18; // WC=19, DIV=20, CONF=21
}

/**
 * Map of ESPN playoff week -> app-internal week (for bulk conversions).
 */
export const PLAYOFF_WEEK_MAP = { 1: 19, 2: 20, 3: 21, 4: 23, 5: 23 };

/**
 * Weeks to skip in the survivor pool (Pro Bowl).
 */
export const SKIP_WEEKS = [22];

/**
 * Maximum valid week number.
 */
export const MAX_WEEK = 23;

/**
 * Regular season week count.
 */
export const REGULAR_SEASON_WEEKS = 18;
