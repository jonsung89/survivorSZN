import { getAnalytics, logEvent, setUserProperties, setUserId } from 'firebase/analytics';
import { initializeApp, getApps } from 'firebase/app';

let analytics = null;
let isExcluded = false;

/**
 * Initialize Firebase Analytics.
 * Call once on app startup after auth is ready.
 */
export function initAnalytics(user) {
  try {
    // Firebase app should already be initialized from firebase.js
    const app = getApps()[0];
    if (!app) return;

    analytics = getAnalytics(app);

    if (user) {
      setUserId(analytics, user.id);
      isExcluded = user.isAdmin === true;
      setUserProperties(analytics, {
        is_admin: user.isAdmin ? 'true' : 'false',
      });
    }
  } catch (err) {
    // Analytics may fail in dev or if blocked by browser
    console.warn('Analytics init failed:', err.message);
  }
}

/**
 * Set the current user for analytics.
 * Call when user logs in or admin status changes.
 */
export function setAnalyticsUser(user) {
  if (!analytics) return;
  if (user) {
    setUserId(analytics, user.id);
    isExcluded = user.isAdmin === true;
    setUserProperties(analytics, {
      is_admin: user.isAdmin ? 'true' : 'false',
    });
  }
}

/**
 * Track a page view.
 */
export function trackPageView(pageName) {
  if (!analytics || isExcluded) return;
  logEvent(analytics, 'page_view', {
    page_title: pageName,
  });
}

/**
 * Track a button click or CTA interaction.
 */
export function trackClick(buttonId, metadata = {}) {
  if (!analytics || isExcluded) return;
  logEvent(analytics, 'button_click', {
    button_id: buttonId,
    ...metadata,
  });
}

/**
 * Track a sport tab click in the schedule page.
 */
export function trackSportTabClick(sportId) {
  if (!analytics || isExcluded) return;
  logEvent(analytics, 'sport_tab_click', {
    sport_id: sportId,
  });
}

/**
 * Track gamecast open event.
 */
export function trackGamecastOpen(gameId, sportId) {
  if (!analytics || isExcluded) return;
  logEvent(analytics, 'gamecast_open', {
    game_id: gameId,
    sport_id: sportId,
  });
}

/**
 * Track gamecast close event with duration.
 */
export function trackGamecastClose(gameId, sportId, durationSeconds) {
  if (!analytics || isExcluded) return;
  logEvent(analytics, 'gamecast_close', {
    game_id: gameId,
    sport_id: sportId,
    duration_seconds: durationSeconds,
  });
}

/**
 * Track gamecast expand click.
 */
export function trackGamecastExpand(gameId, section) {
  if (!analytics || isExcluded) return;
  logEvent(analytics, 'gamecast_expand_click', {
    game_id: gameId,
    section: section,
  });
}

/**
 * Track theme toggle.
 */
export function trackThemeToggle(newTheme) {
  if (!analytics || isExcluded) return;
  logEvent(analytics, 'theme_toggle', {
    new_theme: newTheme,
  });
  setUserProperties(analytics, {
    theme_preference: newTheme,
  });
}

/**
 * Track a generic custom event.
 */
export function trackEvent(eventName, params = {}) {
  if (!analytics || isExcluded) return;
  logEvent(analytics, eventName, params);
}
