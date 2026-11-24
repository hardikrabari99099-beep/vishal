export const CHART_SPEED_PRESETS = [
  { label: "50ms", ms: 50, tag: "Turbo" },
  { label: "150ms", ms: 150, tag: "Live" },
  { label: "500ms", ms: 500, tag: "Normal" },
  { label: "1s", ms: 1000, tag: "Calm" },
];

export const DEFAULT_CHART_FEED = {
  enabled: true,
  tick_interval_ms: 150,
  fallback_last3_digits: true,
  reconcile_on_api: true,
};

export const DEFAULT_FX_CONFIG = {
  cursor_glow: true,
  tilt_3d: true,
  kinetic_motion: true,
};

export function clampTickIntervalMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_CHART_FEED.tick_interval_ms;
  return Math.max(50, Math.min(2000, Math.round(n)));
}

export function normalizeChartFeedConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: src.enabled !== false,
    tick_interval_ms: clampTickIntervalMs(src.tick_interval_ms),
    fallback_last3_digits: src.fallback_last3_digits !== false,
    reconcile_on_api: src.reconcile_on_api !== false,
  };
}

export function normalizeFxConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    cursor_glow: src.cursor_glow !== false,
    tilt_3d: src.tilt_3d !== false,
    kinetic_motion: src.kinetic_motion !== false,
  };
}

let currentChartFeed = { ...DEFAULT_CHART_FEED };
let currentFxConfig = { ...DEFAULT_FX_CONFIG };
const listeners = new Set();

export function getChartFeedConfig() {
  return currentChartFeed;
}

export function getFxConfig() {
  return currentFxConfig;
}

export function publishWidgetsConfig(widgets) {
  const nextFeed = normalizeChartFeedConfig(widgets?.chart_feed);
  const nextFx = normalizeFxConfig(widgets?.fx);
  const feedChanged =
    nextFeed.enabled !== currentChartFeed.enabled ||
    nextFeed.tick_interval_ms !== currentChartFeed.tick_interval_ms ||
    nextFeed.fallback_last3_digits !== currentChartFeed.fallback_last3_digits ||
    nextFeed.reconcile_on_api !== currentChartFeed.reconcile_on_api;
  const fxChanged =
    nextFx.cursor_glow !== currentFxConfig.cursor_glow ||
    nextFx.tilt_3d !== currentFxConfig.tilt_3d ||
    nextFx.kinetic_motion !== currentFxConfig.kinetic_motion;

  if (!feedChanged && !fxChanged) return;
  currentChartFeed = nextFeed;
  currentFxConfig = nextFx;
  for (const fn of listeners) {
    try {
      fn({ chart_feed: currentChartFeed, fx: currentFxConfig });
    } catch {
      // ignore subscriber errors
    }
  }
}

export function subscribeWidgetsConfig(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
