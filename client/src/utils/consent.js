/**
 * GDPR consent utilities for analytics tracking.
 * EU users must opt-in; non-EU users are tracked by default.
 */

const CONSENT_KEY = 'szn_analytics_consent';

// EU/EEA timezones (Europe/* plus Atlantic territories of EU countries)
const EU_ATLANTIC_ZONES = ['Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Atlantic/Faroe', 'Atlantic/Reykjavik'];

/**
 * Detect if the user is likely in the EU/EEA based on their timezone.
 * This is a best-effort check — not 100% accurate but avoids API calls.
 */
export function isEUUser() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return false;
    return tz.startsWith('Europe/') || EU_ATLANTIC_ZONES.includes(tz);
  } catch {
    return false;
  }
}

/**
 * Get the user's analytics consent choice.
 * Returns 'accepted', 'declined', or null (not yet chosen).
 */
export function getAnalyticsConsent() {
  return localStorage.getItem(CONSENT_KEY);
}

/**
 * Save the user's analytics consent choice.
 * @param {'accepted'|'declined'} value
 */
export function setAnalyticsConsent(value) {
  localStorage.setItem(CONSENT_KEY, value);
}

/**
 * Whether analytics tracking should fire.
 * - Non-EU users: always true
 * - EU users: only if they explicitly accepted
 */
export function shouldTrack() {
  if (!isEUUser()) return true;
  return getAnalyticsConsent() === 'accepted';
}
