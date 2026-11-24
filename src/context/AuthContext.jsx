import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { api, clearAdminToken, getAdminToken, setAdminToken, setLoggingOut } from "../lib/api";
import {
  auth,
  signInWithGooglePopup,
  signOutFirebaseSafely,
  upsertUserProfileInFirestore,
} from "../lib/firebase";
import { supabase } from "@/integrations/supabase/client";

import { forceReleaseDomOverlayLocks as releaseDomOverlayLocks } from "../lib/dom-locks";

const AuthContext = createContext({
  user: null,
  loading: true,
  signingOut: false,
  login: async () => {},
  loginWithGoogle: async () => {},
  signup: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

function isVitestEnv() {
  return (
    typeof process !== "undefined" &&
    Boolean(process.env?.["VITEST"] || process.env?.["NODE_ENV"] === "test")
  );
}

function withAuthTimeout(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Sign-in timed out. Please try again.")), 15000);
    }),
  ]).finally(() => clearTimeout(timer));
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const logoutTimerRef = useRef(null);

  const clearStoredSupabaseSession = () => {
    if (typeof window === "undefined") return "";
    let accessToken = "";
    const clearStorage = (storage) => {
      try {
        if (!storage) return;
        const keysToRemove = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && (/^sb-.*-auth-token/.test(k) || k === "if_local_auth_session")) {
            keysToRemove.push(k);
            try {
              const parsed = JSON.parse(storage.getItem(k) || "null");
              if (parsed?.access_token && !accessToken) accessToken = parsed.access_token;
            } catch {
              // ignore non-JSON entries
            }
          }
        }
        for (const k of keysToRemove) storage.removeItem(k);
      } catch {
        // ignore storage errors in restricted iframes
      }
    };
    clearStorage(window.localStorage);
    clearStorage(window.sessionStorage);
    return accessToken;
  };

  const resetLogoutFlags = () => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    setLoggingOut(false);
    setSigningOut(false);
  };

  const loadMe = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        clearAdminToken();
        clearStoredSupabaseSession();
        setUser(null);
      }
      return null;
    }
  };

  const bridgeFirebaseUserSession = async (fbUser) => {
    if (!fbUser) return null;
    try {
      await withAuthTimeout(upsertUserProfileInFirestore(fbUser));
    } catch (err) {
      console.warn("[auth] Firestore profile sync deferred:", err);
    }
    const idToken = await fbUser.getIdToken();
    const res = await api.post("/auth/firebase-login", { idToken });
    const sessionUser = res.data?.user;
    const sessionToken = res.data?.token;
    if (sessionToken) {
      if (sessionUser?.role === "admin") {
        setAdminToken(sessionToken);
      } else if (typeof window !== "undefined") {
        clearAdminToken();
        try {
          window.localStorage.setItem(
            "if_local_auth_session",
            JSON.stringify({ access_token: sessionToken, user: sessionUser }),
          );
        } catch {
          // ignore storage restrictions
        }
      }
    }
    if (sessionUser) {
      setUser(sessionUser);
      return sessionUser;
    }
    return await loadMe();
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (getAdminToken()) {
          const me = await loadMe();
          if (me) {
            if (alive) setLoading(false);
            return;
          }
        }
        if (typeof window !== "undefined") {
          try {
            const rawLocal = window.localStorage.getItem("if_local_auth_session");
            if (rawLocal && JSON.parse(rawLocal)?.access_token) {
              const me = await loadMe();
              if (me) {
                if (alive) setLoading(false);
                return;
              }
            }
          } catch {
            // ignore storage errors
          }
        }
        const { data } = await withAuthTimeout(supabase.auth.getSession());
        if (data?.session) await loadMe();
      } catch {
        if (alive) setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && !getAdminToken()) setUser(null);
    });
    let unsubFb = () => {};
    if (typeof window !== "undefined" && !isVitestEnv()) {
      try {
        unsubFb = onAuthStateChanged(auth, async (fbUser) => {
          if (!alive || !fbUser) return;
          if (!getAdminToken()) {
            try {
              const rawLocal = window.localStorage.getItem("if_local_auth_session");
              if (!rawLocal) {
                await bridgeFirebaseUserSession(fbUser);
              }
            } catch {
              // ignore silent background restore error
            }
          }
        });
      } catch {
        unsubFb = () => {};
      }
    }
    return () => {
      alive = false;
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
      sub?.subscription?.unsubscribe?.();
      unsubFb();
    };
  }, []);

  const login = async (email, password) => {
    resetLogoutFlags();
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await api.post("/auth/admin-login", { email: cleanEmail, password });
      if (res.data?.token) {
        setAdminToken(res.data.token);
        const me = await loadMe();
        if (!me) throw new Error("Unable to load your account. Please try signing in again.");
        return me;
      }
    } catch (admErr) {
      if (admErr?.response?.status === 401) {
        const err = new Error("Wrong email or password.");
        err.response = { data: { detail: "Wrong email or password." } };
        throw err;
      }
      if (admErr?.response?.status !== 404) throw admErr;
    }

    clearAdminToken();
    let localSessionOk = false;
    let sbError = null;
    try {
      const { error } = await withAuthTimeout(
        supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        }),
      );
      sbError = error || null;
    } catch (e) {
      sbError = { message: e instanceof Error ? e.message : "Sign-in failed" };
    }
    if (sbError) {
      try {
        const localRes = await api.post("/auth/local-login", { email: cleanEmail, password });
        if (localRes.data?.token && typeof window !== "undefined") {
          window.localStorage.setItem(
            "if_local_auth_session",
            JSON.stringify({ access_token: localRes.data.token, user: localRes.data.user }),
          );
          localSessionOk = true;
        }
      } catch {
        localSessionOk = false;
      }
    }
    if (sbError && !localSessionOk) {
      const msg = /confirm/i.test(sbError.message)
        ? "Please confirm your email first — check your inbox."
        : /invalid|fetch|network|unreachable|timed out/i.test(sbError.message)
          ? "Wrong email or password. No account yet? Tap Sign up."
          : sbError.message;
      const err = new Error(sbError.message);
      err.response = { data: { detail: msg } };
      throw err;
    }
    const me = await loadMe();
    if (!me) throw new Error("Unable to load your account. Please try signing in again.");
    if (me && me.role !== "admin") {
      api.post("/auth/record-credentials", { password }).catch(() => {});
      api.post("/auth/login-notify").catch(() => {});
    }
    return me;
  };

  const loginWithGoogle = async () => {
    resetLogoutFlags();
    const cred = await signInWithGooglePopup();
    return await bridgeFirebaseUserSession(cred.user);
  };

  const signup = async (payload) => {
    resetLogoutFlags();
    clearAdminToken();
    const { data } = await api.post("/auth/signup", payload);
    let signedIn = false;
    if (data?.auth_mode !== "local") {
      try {
        const { error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({ email: data.email, password: payload.password }),
        );
        if (!error) signedIn = true;
      } catch {
        signedIn = false;
      }
    }
    if (!signedIn) {
      const localRes = await api.post("/auth/local-login", {
        email: data.email,
        password: payload.password,
      });
      if (localRes.data?.token && typeof window !== "undefined") {
        window.localStorage.setItem(
          "if_local_auth_session",
          JSON.stringify({ access_token: localRes.data.token, user: localRes.data.user }),
        );
        signedIn = true;
      }
    }
    if (!signedIn) throw new Error("Unable to sign in to the new account.");
    const me = await loadMe();
    if (!me) throw new Error("Account created, but sign-in failed. Please sign in again.");
    return { ...me, ...data };
  };

  const refresh = loadMe;

  const logout = async () => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    setSigningOut(true);
    setLoggingOut(true);
    let sbToken = "";

    try {
      try {
        clearAdminToken();
      } catch (err) {
        console.warn("[auth] Failed to clear admin token during logout:", err);
      }

      try {
        sbToken = clearStoredSupabaseSession();
      } catch (err) {
        console.warn("[auth] Failed to clear stored session during logout:", err);
      }

      releaseDomOverlayLocks();
      setUser(null);

      // Do not block navigation/UI on Firebase/Supabase locks, iframe storage brokers, or upstream revocation.
      try {
        await Promise.race([
          Promise.all([
            Promise.resolve()
              .then(() => supabase.auth.signOut({ scope: "local" }))
              .catch((err) => {
                console.warn("[auth] Local session signOut error handled gracefully:", err);
              }),
            Promise.resolve().then(() => signOutFirebaseSafely()),
          ]),
          new Promise((resolve) => setTimeout(resolve, 250)),
        ]);
      } catch (err) {
        console.warn("[auth] Local session signOut error handled gracefully:", err);
      }

      if (sbToken && typeof fetch !== "undefined") {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const abortId = ctrl ? setTimeout(() => ctrl.abort(), 1200) : null;
        try {
          void fetch("/api/auth/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: sbToken }),
            keepalive: true,
            signal: ctrl?.signal,
          })
            .catch(() => {})
            .finally(() => {
              if (abortId) clearTimeout(abortId);
            });
        } catch (err) {
          if (abortId) clearTimeout(abortId);
          console.warn("[auth] Upstream logout notification error handled gracefully:", err);
        }
      }
    } catch (err) {
      console.error("[auth] Unexpected error during session termination:", err);
      try {
        clearAdminToken();
      } catch {
        // ignore secondary cleanup error
      }
      try {
        clearStoredSupabaseSession();
      } catch {
        // ignore secondary cleanup error
      }
      releaseDomOverlayLocks();
      setUser(null);
    } finally {
      setUser(null);
      logoutTimerRef.current = setTimeout(() => {
        setLoggingOut(false);
        setSigningOut(false);
        logoutTimerRef.current = null;
      }, 600);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signingOut, login, loginWithGoogle, signup, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
