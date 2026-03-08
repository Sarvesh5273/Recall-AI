/**
 * Analytics utility for tracking key user events.
 *
 * Currently logs to console. Replace with PostHog, Firebase Analytics,
 * or Sentry performance when ready.
 *
 * Usage:
 *   import { analytics } from '../utils/analytics';
 *   analytics.track('scan_completed', { itemCount: 5 });
 */

type EventProperties = Record<string, string | number | boolean>;

class Analytics {
  private enabled: boolean;

  constructor() {
    this.enabled = !__DEV__;
  }

  track(event: string, properties?: EventProperties) {
    if (__DEV__) {
      console.log(`[Analytics] ${event}`, properties || '');
    }

    // TODO: Send to PostHog or Firebase Analytics
    // posthog.capture(event, properties);
  }

  identify(shopId: string, traits?: EventProperties) {
    if (__DEV__) {
      console.log(`[Analytics] identify: ${shopId}`, traits || '');
    }

    // TODO: posthog.identify(shopId, traits);
  }

  screen(screenName: string) {
    this.track('screen_view', { screen: screenName });
  }
}

export const analytics = new Analytics();

// Standard event names
export const Events = {
  APP_OPEN: 'app_open',
  SCAN_INITIATED: 'scan_initiated',
  SCAN_COMPLETED: 'scan_completed',
  SCAN_FAILED: 'scan_failed',
  QUARANTINE_RESOLVED: 'quarantine_resolved',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  INVENTORY_VIEWED: 'inventory_viewed',
  LANGUAGE_CHANGED: 'language_changed',
  CUSTOM_ITEM_ADDED: 'custom_item_added',
  SYNC_COMPLETED: 'sync_completed',
} as const;
