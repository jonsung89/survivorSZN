/**
 * parseClockToSeconds — converts a game clock display string to total seconds remaining.
 * E.g. "10:34" → 634, "0:45" → 45, "5:00" → 300.
 * Returns null if the format is unrecognized.
 */
export function parseClockToSeconds(displayValue) {
  if (!displayValue) return null;
  const parts = displayValue.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (isNaN(mins) || isNaN(secs)) return null;
    return mins * 60 + secs;
  }
  if (parts.length === 1) {
    const val = parseFloat(parts[0]);
    return isNaN(val) ? null : val;
  }
  return null;
}

/**
 * formatClockDuration — formats seconds into a clock-style display (M:SS).
 * E.g. 243 → "4:03", 45 → "0:45"
 */
export function formatClockDuration(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return '0:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
