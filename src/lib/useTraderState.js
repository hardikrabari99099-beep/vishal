import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_SETTINGS } from "./default-settings";

const EMPTY_ARRAY = [];
const EMPTY_OBJ = {};

export function useTraderState(options = {}) {
  const { pollMs = 5000 } = options;
  const { user } = useAuth();
  const [accountId, setAccountId] = useState("");
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    async (overrideId) => {
      if (!user) {
        setState(null);
        setLoading(false);
        return null;
      }
      try {
        const targetId = overrideId ?? accountId;
        const params = targetId ? { account_id: targetId } : {};
        const { data } = await api.get("/me/trading-state", { params });
        setState(data);
        if (data?.activeAccount?.id && !targetId) {
          setAccountId(data.activeAccount.id);
        }
        return data;
      } catch (err) {
        if (err?.response?.status === 401) {
          setState(null);
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user, accountId],
  );

  useEffect(() => {
    load();
    if (!user || !pollMs || pollMs < 1500) return;
    const id = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) {
        load();
      }
    }, pollMs);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [load, pollMs, user]);

  const activeAccount = state?.activeAccount || null;
  const accounts = state?.accounts || EMPTY_ARRAY;
  const hasActiveAccount = useMemo(
    () =>
      accounts.some(
        (a) =>
          ["Active", "Funded", "Passed"].includes(a.status || "Active") &&
          Number(a.balance || 0) > 0,
      ),
    [accounts],
  );
  const hasPurchasedChallenge = useMemo(
    () =>
      Boolean(
        state?.has_purchased_challenge ??
        (hasActiveAccount || accounts.length > 0),
      ),
    [state?.has_purchased_challenge, hasActiveAccount, accounts.length],
  );
  const isAccountFailed = useMemo(
    () =>
      Boolean(
        activeAccount &&
        (String(activeAccount.status || "").toLowerCase() === "failed" ||
          activeAccount.trading_enabled === false),
      ),
    [activeAccount],
  );
  const isAccountPassed = useMemo(
    () =>
      Boolean(
        activeAccount &&
        String(activeAccount.status || "").toLowerCase() === "passed",
      ),
    [activeAccount],
  );
  const canTradeAccount = useMemo(
    () =>
      Boolean(
        activeAccount &&
        ["active", "funded"].includes(
          String(activeAccount.status || "active").toLowerCase(),
        ) &&
        activeAccount.trading_enabled !== false &&
        Number(activeAccount.balance || 0) > 0,
      ),
    [activeAccount],
  );

  const evaluationRisk = useMemo(
    () => ({
      ...DEFAULT_SETTINGS.evaluation_risk,
      ...(state?.evaluation_risk || EMPTY_OBJ),
    }),
    [state?.evaluation_risk],
  );

  const selectAccount = useCallback(
    async (nextId) => {
      setAccountId(nextId);
      return load(nextId);
    },
    [load],
  );

  const placeOrder = useCallback(
    async ({
      symbol,
      side,
      qty,
      type = "MARKET",
      limit_price,
      product = "MIS",
      stoploss = null,
      target = null,
      expiry_label = "",
      note = "",
    }) => {
      setSubmitting(true);
      try {
        const { data } = await api.post("/me/orders", {
          account_id: state?.activeAccount?.id || accountId,
          symbol,
          side,
          qty,
          type,
          limit_price,
          product,
          stoploss,
          target,
          expiry_label,
          note,
        });
        await load();
        return data;
      } finally {
        setSubmitting(false);
      }
    },
    [accountId, load, state?.activeAccount?.id],
  );

  const cancelOrder = useCallback(
    async (orderId) => {
      setSubmitting(true);
      try {
        const { data } = await api.post(`/me/orders/${orderId}/cancel`);
        await load();
        return data;
      } finally {
        setSubmitting(false);
      }
    },
    [load],
  );

  const closePosition = useCallback(
    async (posId, note = "") => {
      setSubmitting(true);
      try {
        const { data } = await api.post(
          `/me/positions/${posId}/close`,
          note ? { note } : {},
        );
        await load();
        return data;
      } finally {
        setSubmitting(false);
      }
    },
    [load],
  );

  const closeAllPositions = useCallback(
    async (overrideAcctId) => {
      setSubmitting(true);
      try {
        const { data } = await api.post("/me/positions/close-all", {
          account_id: overrideAcctId || state?.activeAccount?.id || accountId,
        });
        await load();
        return data;
      } finally {
        setSubmitting(false);
      }
    },
    [accountId, load, state?.activeAccount?.id],
  );

  const updateNote = useCallback(
    async (kind, id, note) => {
      const path = kind === "order" ? `/me/orders/${id}` : `/me/trades/${id}`;
      const { data } = await api.patch(path, { note });
      await load();
      return data;
    },
    [load],
  );

  const evaluateRisk = useCallback(
    async (overrideAcctId) => {
      const targetId = overrideAcctId || state?.activeAccount?.id || accountId;
      if (!targetId) return null;
      const { data } = await api.post("/me/risk/evaluate", {
        account_id: targetId,
      });
      await load(targetId);
      return data;
    },
    [accountId, load, state?.activeAccount?.id],
  );

  return {
    authenticated: !!user,
    isAdmin: user?.role === "admin",
    accounts,
    activeAccount,
    hasActiveAccount,
    hasPurchasedChallenge,
    isAccountFailed,
    isAccountPassed,
    canTradeAccount,
    evaluationRisk,
    kyc: state?.kyc || user?.kyc || EMPTY_OBJ,
    orders: state?.orders || EMPTY_ARRAY,
    positions: state?.positions || EMPTY_ARRAY,
    trades: state?.trades || EMPTY_ARRAY,
    transactions: state?.transactions || EMPTY_ARRAY,
    loading,
    submitting,
    selectAccount,
    placeOrder,
    cancelOrder,
    closePosition,
    closeAllPositions,
    updateNote,
    evaluateRisk,
    refresh: () => load(),
  };
}
