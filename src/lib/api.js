import axios from "axios";
import { supabase } from "@/integrations/supabase/client";

// Same-origin API (implemented in src/routes/api/$.ts).
export const API = "/api";

export const api = axios.create({
  baseURL: API,
  withCredentials: false,
  timeout: 15000,
});

const ADMIN_TOKEN_KEY = "if_admin_token";
let memAdminToken = "";

export function getAdminToken() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_KEY) || memAdminToken;
  } catch {
    return memAdminToken;
  }
}

export function setAdminToken(token) {
  memAdminToken = token || "";
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore storage errors in private iframes
  }
}

export function clearAdminToken() {
  setAdminToken("");
}

let loggingOut = false;
export function setLoggingOut(v) {
  loggingOut = Boolean(v);
}

// Attach the signed-in user's session token without ever deadlocking on storage/locks.
api.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined" && !loggingOut) {
    const adminToken = getAdminToken();
    if (adminToken) {
      config.headers.Authorization = `Bearer ${adminToken}`;
      return config;
    }
    try {
      const rawLocal = window.localStorage.getItem("if_local_auth_session");
      if (rawLocal) {
        const parsed = JSON.parse(rawLocal);
        if (parsed?.access_token) {
          config.headers.Authorization = `Bearer ${parsed.access_token}`;
          return config;
        }
      }
    } catch {
      // ignore local storage parse/access errors
    }
    try {
      const sessionRes = await Promise.race([
        supabase.auth.getSession(),
        new Promise((resolve) => setTimeout(() => resolve(null), 400)),
      ]);
      const t = sessionRes?.data?.session?.access_token;
      if (t) config.headers.Authorization = `Bearer ${t}`;
    } catch {
      // ignore session lookup errors
    }
  }
  return config;
});

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
