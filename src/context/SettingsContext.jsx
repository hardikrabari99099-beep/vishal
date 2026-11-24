import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { fetchPublicSiteConfigFromFirestore, testConnection } from "../lib/firebase";

import { DEFAULT_SETTINGS } from "../lib/default-settings";
import { publishWidgetsConfig } from "../lib/live-feed-config";
export { DEFAULT_SETTINGS };

const SYNC_CHANNEL = "indifunded-sync";
const SYNC_STORAGE_KEY = "indifunded:sync-ping";

export function broadcastSync(scope = "all") {
  if (typeof window === "undefined") return;
  const payload = { scope, ts: Date.now() };
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(SYNC_CHANNEL);
      ch.postMessage(payload);
      ch.close();
    }
  } catch {
    // ignore BroadcastChannel restrictions
  }
  try {
    window.localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  loading: true,
  reload: () => {},
  syncVersion: 0,
});

// Deep merge helper: fills missing keys from defaults
export function mergeSettings(target, source) {
  if (Array.isArray(source)) return source;
  if (source && typeof source === "object") {
    const out = { ...(target && typeof target === "object" ? target : {}) };
    for (const k of Object.keys(source)) {
      out[k] = mergeSettings(target?.[k], source[k]);
    }
    for (const k of Object.keys(target || {})) {
      if (!(k in out) || out[k] === undefined || out[k] === null) out[k] = target[k];
    }
    return out;
  }
  return source === undefined || source === null ? target : source;
}

const SETTINGS_CACHE_KEY = "if_site_settings_v1";

function readCachedSettings() {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(SETTINGS_CACHE_KEY) ||
      window.sessionStorage.getItem(SETTINGS_CACHE_KEY);
    return raw ? mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  const serverVersionRef = useRef(null);
  const lastVersionCheckRef = useRef(0);
  const inFlightRef = useRef(null);

  const fetchSettings = useCallback(async (force = false) => {
    if (inFlightRef.current && !force) return inFlightRef.current;
    const task = (async () => {
      try {
        const [apiRes, cloudConfig] = await Promise.all([
          api
            .get("/settings", {
              params: { _refresh: force ? Date.now() : undefined, _t: Date.now() },
              headers: { "Cache-Control": "no-cache" },
            })
            .catch(() => null),
          fetchPublicSiteConfigFromFirestore().catch(() => null),
        ]);

        let nextRaw =
          apiRes?.data && typeof apiRes.data === "object" && Object.keys(apiRes.data).length > 0
            ? apiRes.data
            : null;

        if (cloudConfig && typeof cloudConfig === "object") {
          const { id: _cid, updatedAt: _uAt, ...cloudFields } = cloudConfig;
          if (Object.keys(cloudFields).length > 0) {
            nextRaw = nextRaw
              ? apiRes?.headers?.["x-settings-saved"] === "false"
                ? mergeSettings(nextRaw, cloudFields)
                : mergeSettings(cloudFields, nextRaw)
              : cloudFields;
          }
        }

        if (nextRaw && Object.keys(nextRaw).length > 0) {
          const merged = mergeSettings(DEFAULT_SETTINGS, nextRaw);
          setSettings(merged);
          publishWidgetsConfig(merged.widgets);
          if (typeof window !== "undefined") {
            const serialized = JSON.stringify(nextRaw);
            try {
              window.localStorage.setItem(SETTINGS_CACHE_KEY, serialized);
            } catch {
              // ignore storage quota errors
            }
            try {
              window.sessionStorage.setItem(SETTINGS_CACHE_KEY, serialized);
            } catch {
              // ignore storage quota errors
            }
          }
        }
      } catch (_) {
        /* keep defaults or cached settings */
      } finally {
        setLoading(false);
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = task;
    return task;
  }, []);

  const reload = useCallback(
    async (force = false) => {
      await fetchSettings(force);
      setSyncVersion((v) => v + 1);
      if (force) {
        broadcastSync("settings");
      }
    },
    [fetchSettings],
  );

  useEffect(() => {
    void testConnection();
    const cached = readCachedSettings();
    if (cached) {
      setSettings(cached);
      publishWidgetsConfig(cached.widgets);
    }
    fetchSettings(false);
  }, [fetchSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;

    const triggerRefresh = (forceFetch = false) => {
      if (!alive) return;
      fetchSettings(forceFetch);
      setSyncVersion((v) => v + 1);
    };

    const checkServerVersion = async () => {
      if (!alive) return;
      const now = Date.now();
      if (now - lastVersionCheckRef.current < 15000) return;
      lastVersionCheckRef.current = now;
      try {
        const res = await api.get("/sync/version", { params: { _t: now } });
        const v = Number(res.data?.version || 0);
        if (serverVersionRef.current !== null && v > serverVersionRef.current) {
          serverVersionRef.current = v;
          triggerRefresh(true);
        } else if (serverVersionRef.current === null && v > 0) {
          serverVersionRef.current = v;
        }
      } catch {
        // ignore transient network check errors
      }
    };

    let es = null;
    let sseErrors = 0;
    if (typeof EventSource !== "undefined") {
      try {
        es = new EventSource("/api/sync/stream");
        es.addEventListener("sync", (ev) => {
          sseErrors = 0;
          try {
            const payload = JSON.parse(ev.data || "{}");
            const v = Number(payload.version || 0);
            if (serverVersionRef.current !== null && v > serverVersionRef.current) {
              serverVersionRef.current = v;
              triggerRefresh(true);
            } else if (serverVersionRef.current === null) {
              serverVersionRef.current = v;
            }
          } catch {
            // ignore malformed event data
          }
        });
        es.addEventListener("error", () => {
          sseErrors += 1;
          if (sseErrors >= 2 && es) {
            es.close();
            es = null;
          }
        });
      } catch {
        es = null;
      }
    }

    let bc = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel(SYNC_CHANNEL);
        bc.onmessage = () => triggerRefresh(true);
      } catch {
        bc = null;
      }
    }

    const onStorage = (e) => {
      if (e.key === SYNC_STORAGE_KEY) triggerRefresh(true);
    };
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        checkServerVersion();
      }
    };
    const onFocus = () => checkServerVersion();

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      alive = false;
      if (es) es.close();
      if (bc) bc.close();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [fetchSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, reload, syncVersion }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
