import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "@/lib/router-compat";
import { toast } from "sonner";
import { api, formatINR, formatApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import {
  DEFAULT_MARKET_SYMBOLS,
  EXCHANGE_INDEX_SYMBOLS,
  useLiveMarketQuotes,
  useLiveCandles,
  searchMarketSymbols,
  formatPrice,
} from "../../lib/useLiveMarket";
import {
  OPTION_UNDERLYINGS,
  buildOptionChain,
  extractUnderlyingFromSymbol,
  formatLac,
  getOptionSpec,
  getUpcomingExpiries,
} from "../../lib/options-chain";
import { useTraderState } from "../../lib/useTraderState";
import { useKeyboardShortcuts } from "../../lib/useKeyboardShortcuts";
import {
  PRODUCT_TYPES,
  computeAccountRiskSnapshot,
  isClassicProduct,
  productBadgeLabel,
} from "../../lib/funding-products";
import { CandleChart } from "../../components/CandleChart";
import BrandLogo from "../../components/BrandLogo";
import {
  ArrowLeft,
  ArrowRight,
  CandlestickChart,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Compass,
  HelpCircle,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Monitor,
  Moon,
  Pencil,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  StickyNote,
  Sun,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";

const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "1D"];
const WATCHLIST_STORAGE_KEY = "if_terminal_starred_v1";
const GUIDE_STEPS = [
  {
    title: "Live NSE & BSE Index Strip",
    body: "Track NIFTY, BANKNIFTY, FINNIFTY, SENSEX, MIDCPNIFTY, and BANKEX live at the top. Click any index card to switch both the chart underlying and Quick Strikes chain immediately.",
  },
  {
    title: "Real-Time Evaluation Guardrails",
    body: "Right beneath the indices, monitor your Profit Target progress, Daily Loss Room, Max Overall Drawdown Room, and daily trade count — enforced server-side on every order.",
  },
  {
    title: "Interactive TradingView Chart",
    body: "Switch across 1m, 3m, 5m, 15m, 30m, 1h, and 1D timeframes, toggle Candles vs Area, overlay EMA20, or press F anytime to expand the chart fullscreen.",
  },
  {
    title: "ATM Quick Strikes Grid",
    body: "Pick your expiry date on the right panel to view ATM-centered Calls and Puts. Tap any emerald Call or rose Put price pill to launch a pre-filled Option Order Ticket.",
  },
  {
    title: "Order Ticket with MIS / NRML & SL / Target",
    body: "Place MARKET or LIMIT orders in Lots, toggle Intraday (MIS) or Overnight (NRML), attach optional Stoploss & Target levels, and record Trade Notes synced straight to your Trade Book.",
  },
  {
    title: "Live Positions & One-Click Square Off",
    body: "Monitor unrealized MTM P&L ticking live on every open position below Quick Strikes or in the dedicated Positions tab, with instant single-click Exit or Square off all.",
  },
  {
    title: "Full Option Chain, Orders & Account Tabs",
    body: "Switch between Trade, Chain (star contracts to Watchlist & trade Bid/Ask), Positions, Orders (Open/Closed/History + notes), and Account (Metrics, P&L Calendar, Rule Events & Theme).",
  },
  {
    title: "⚡ Lightning Multi-Chart & One-Click Mode",
    body: "Press L or toggle ⚡ Lightning in the top bar for side-by-side dual charts, a persistent bottom Positions/Orders blotter, and an instant Quick Order ticket with One-click execution.",
  },
];

const inr = (n) => formatINR(Math.round(Number(n) || 0));
const signed = (n) => `${n >= 0 ? "+" : "−"}${inr(Math.abs(n))}`;
const pnlCls = (n) => (n >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]");

function useIsDesktopLg() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1024,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isDesktop;
}

function TerminalStatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const tone = [
    "active",
    "executed",
    "paid",
    "funded",
    "approved",
    "open",
    "verified",
    "resolved",
    "passed",
  ].includes(s)
    ? "ok"
    : [
          "pending",
          "processing",
          "submitted",
          "in review",
          "under review",
        ].includes(s)
      ? "wait"
      : ["failed", "rejected", "cancelled", "breached"].includes(s)
        ? "bad"
        : "neutral";
  return <span className={`status-pill is-${tone}`}>{status}</span>;
}

export function TradingTerminal({ embedded = false } = {}) {
  const isDesktop = useIsDesktopLg();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();

  const {
    authenticated,
    accounts,
    activeAccount,
    hasActiveAccount,
    hasPurchasedChallenge,
    isAccountFailed,
    isAccountPassed,
    evaluationRisk,
    orders: liveOrders,
    positions: livePositions,
    trades: liveTrades,
    submitting,
    selectAccount,
    placeOrder,
    cancelOrder,
    closePosition,
    closeAllPositions,
    updateNote,
    refresh: refreshTrader,
  } = useTraderState({ pollMs: 5000 });

  const paramSym = (searchParams.get("symbol") || "").trim().toUpperCase();
  const paramSide = (searchParams.get("side") || "").trim().toUpperCase();
  const paramAccount = (searchParams.get("account") || "").trim();

  // Terminal workspace state
  const [activeTab, setActiveTab] = useState("Trade"); // Trade | Chain | Positions | Orders | Account
  const [lightningMode, setLightningMode] = useState(false);
  const [fullscreenChart, setFullscreenChart] = useState(false);

  // Starred / watchlist state
  const [starredSymbols, setStarredSymbols] = useState(() => {
    if (typeof window === "undefined") return ["NIFTY25450CE", "NIFTY25450PE"];
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(WATCHLIST_STORAGE_KEY) || "null",
      );
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {
      // ignore
    }
    return [
      "NIFTY25450CE",
      "NIFTY25450PE",
      "BANKNIFTY62400CE",
      "BANKNIFTY62400PE",
    ];
  });

  const [watchlistSymbols, setWatchlistSymbols] = useState(
    DEFAULT_MARKET_SYMBOLS,
  );
  const [watchFilter, setWatchFilter] = useState("ALL");
  const [exchangeFilter, setExchangeFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Selected symbol + chart settings
  const [sym, setSym] = useState(paramSym || "NIFTY");
  const [secondarySym, setSecondarySym] = useState("BANKNIFTY");
  const [optionUnderlying, setOptionUnderlying] = useState(() =>
    paramSym ? extractUnderlyingFromSymbol(paramSym) : "NIFTY",
  );
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [tf, setTf] = useState("5m");
  const [secondaryTf, setSecondaryTf] = useState("5m");
  const [chartMode, setChartMode] = useState("candle");
  const [showEma, setShowEma] = useState(true);

  // Order ticket state
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketSym, setTicketSym] = useState(paramSym || "NIFTY");
  const [suggestedTicketLtp, setSuggestedTicketLtp] = useState(0);
  const [side, setSide] = useState(paramSide === "SELL" ? "SELL" : "BUY");
  const [product, setProduct] = useState("MIS"); // MIS | NRML
  const [orderType, setOrderType] = useState("MARKET"); // MARKET | LIMIT
  const [limitPrice, setLimitPrice] = useState("");
  const [lots, setLots] = useState(1);
  const [showSlTarget, setShowSlTarget] = useState(false);
  const [stoploss, setStoploss] = useState("");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");

  // Lightning & mobile workspace state
  const [oneClick, setOneClick] = useState(false);
  const [lightningSubTab, setLightningSubTab] = useState("Positions");
  const [lightningMobileTab, setLightningMobileTab] = useState("Trade"); // Trade | Positions | Orders
  const [lightningChartsCount, setLightningChartsCount] = useState(2); // 1 | 2
  const [lightningFocusedChart, setLightningFocusedChart] = useState("primary");
  const [lightningBannerVisible, setLightningBannerVisible] = useState(true);
  const [ordersSubTab, setOrdersSubTab] = useState("All"); // Open | Closed | All
  const [chainMobileSide, setChainMobileSide] = useState("CE"); // CE | PE
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileWatchlistOpen, setMobileWatchlistOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [basketTemplate, setBasketTemplate] = useState("Long straddle");
  const [basketLots, setBasketLots] = useState(1);

  // Modals & Popovers
  const [confirm, setConfirm] = useState(false);
  const [purchasePopup, setPurchasePopup] = useState(false);
  const [noteEditor, setNoteEditor] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    subject: "",
    message: "",
  });
  const [sendingFeedback, setSendingFeedback] = useState(false);

  // Account Calendar month state
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const searchInputRef = useRef(null);
  const searchLocked = !hasPurchasedChallenge;

  useEffect(() => {
    if (
      paramAccount &&
      accounts.some((a) => a.id === paramAccount) &&
      activeAccount?.id !== paramAccount
    ) {
      selectAccount(paramAccount);
    }
  }, [paramAccount, accounts, activeAccount?.id, selectAccount]);

  useEffect(() => {
    if (paramSym) {
      setSym(paramSym);
      setTicketSym(paramSym);
      setOptionUnderlying(extractUnderlyingFromSymbol(paramSym));
      setWatchlistSymbols((prev) =>
        prev.includes(paramSym) ? prev : [paramSym, ...prev],
      );
    }
    if (paramSide === "BUY" || paramSide === "SELL") {
      setSide(paramSide);
    }
  }, [paramSym, paramSide]);

  const toggleStar = useCallback((symbol) => {
    const clean = String(symbol || "").toUpperCase();
    setStarredSymbols((prev) => {
      const next = prev.includes(clean)
        ? prev.filter((s) => s !== clean)
        : [clean, ...prev];
      try {
        window.localStorage.setItem(
          WATCHLIST_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const promptSearchUnlock = useCallback(() => {
    toast.info("Purchase a challenge to unlock");
    setPurchasePopup(true);
  }, []);

  const handleSearchTrigger = useCallback(async () => {
    if (searchLocked) {
      promptSearchUnlock();
      return;
    }
    const q = searchQuery.trim();
    if (!q) {
      searchInputRef.current?.focus();
      return;
    }
    setSearching(true);
    try {
      const list = await searchMarketSymbols(q);
      setSearchResults(list);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchLocked, searchQuery, promptSearchUnlock]);

  const activeSymbols = useMemo(() => {
    const extra = livePositions.map((p) => p.symbol);
    return Array.from(
      new Set([
        ...watchlistSymbols,
        ...starredSymbols,
        sym,
        ticketSym,
        secondarySym,
        ...extra,
      ]),
    );
  }, [
    watchlistSymbols,
    starredSymbols,
    sym,
    ticketSym,
    secondarySym,
    livePositions,
  ]);

  const {
    quotes,
    quoteMap,
    marketStatus,
    flashMap,
    loading: quotesLoading,
    refresh: refreshQuotes,
  } = useLiveMarketQuotes(activeSymbols, { pollMs: 2500, microTick: true });

  const {
    candles,
    quote: candleQuote,
    loading: candlesLoading,
    refreshing: candlesRefreshing,
  } = useLiveCandles(sym, tf, { pollMs: 5000 });

  const {
    candles: secCandles,
    quote: secQuote,
    loading: secLoading,
    refreshing: secRefreshing,
  } = useLiveCandles(secondarySym, secondaryTf, {
    pollMs: 5000,
    enabled:
      !embedded && lightningMode && (isDesktop || lightningChartsCount === 2),
  });

  useEffect(() => {
    if (searchLocked) {
      setSearchQuery("");
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const list = await searchMarketSymbols(q);
        setSearchResults(list);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [searchQuery, searchLocked]);

  // Option Chain & Quick Strikes calculation
  const expiries = useMemo(
    () => getUpcomingExpiries(optionUnderlying, 4),
    [optionUnderlying],
  );
  const selectedExpiry = expiries[expiryIdx] ||
    expiries[0] || { id: "weekly", label: "Weekly", dteDays: 4 };
  const underlyingQuote = quoteMap[optionUnderlying];
  const optionChain = useMemo(
    () =>
      buildOptionChain({
        underlying: optionUnderlying,
        spot: underlyingQuote?.ltp,
        prevClose: underlyingQuote?.prevClose,
        liveQuoteMap: quoteMap,
        dteDays: selectedExpiry.dteDays,
        sideCount: activeTab === "Chain" ? 6 : 3,
      }),
    [
      optionUnderlying,
      underlyingQuote?.ltp,
      underlyingQuote?.prevClose,
      quoteMap,
      selectedExpiry.dteDays,
      activeTab,
    ],
  );

  const chartQuote =
    quoteMap[sym]?.source === "Cache"
      ? candleQuote || quoteMap[sym]
      : quoteMap[sym] || candleQuote;
  const activeQuote = chartQuote || candleQuote;
  const secondaryQuote =
    quoteMap[secondarySym]?.source === "Cache"
      ? secQuote || quoteMap[secondarySym]
      : quoteMap[secondarySym] || secQuote;
  const syncedCandles = candles || [];
  const ticketQuote =
    quoteMap[ticketSym] || (ticketSym === sym ? activeQuote : null);
  const effectiveTicketSym = embedded ? sym : ticketSym;
  const effectiveTicketQuote = embedded ? activeQuote : ticketQuote;

  const lotSize =
    effectiveTicketQuote?.lot ||
    (effectiveTicketSym.endsWith("CE") || effectiveTicketSym.endsWith("PE")
      ? getOptionSpec(extractUnderlyingFromSymbol(effectiveTicketSym)).lot
      : 1);
  const ticketLtp =
    effectiveTicketQuote?.ltp ||
    (effectiveTicketSym === sym
      ? syncedCandles[syncedCandles.length - 1]?.close
      : 0) ||
    (!embedded && ticketSym === effectiveTicketSym ? suggestedTicketLtp : 0) ||
    0;
  const qty = Math.max(1, lots) * lotSize;
  const execEstPrice =
    orderType === "LIMIT" && Number(limitPrice) > 0
      ? Number(limitPrice)
      : ticketLtp;
  const estValue = +(execEstPrice * qty).toFixed(2);
  const marginReq = +(estValue * 0.2).toFixed(2);

  const chartLtp =
    activeQuote?.ltp || syncedCandles[syncedCandles.length - 1]?.close || 0;
  const chgPct = activeQuote?.changePct ?? 0;
  const dayHi = Number(activeQuote?.high || chartLtp);
  const dayLo = Number(activeQuote?.low || chartLtp);
  const dayRangePct =
    dayHi > dayLo
      ? Math.max(0, Math.min(100, ((chartLtp - dayLo) / (dayHi - dayLo)) * 100))
      : 50;

  const filteredWatchQuotes = useMemo(() => {
    return quotes.filter((q) => {
      if (exchangeFilter !== "ALL" && q.exchange !== exchangeFilter)
        return false;
      if (watchFilter === "STARRED") return starredSymbols.includes(q.symbol);
      if (watchFilter === "INDEX") return q.kind === "INDEX";
      if (watchFilter === "EQUITY") return q.kind === "EQUITY";
      if (watchFilter === "OPTION") return q.kind === "OPTION";
      return true;
    });
  }, [quotes, watchFilter, exchangeFilter, starredSymbols]);

  const ordersToShow = authenticated ? liveOrders : [];
  const pendingOrders = useMemo(
    () => ordersToShow.filter((o) => o.status === "Pending"),
    [ordersToShow],
  );
  const positionsWithLiveMtm = useMemo(() => {
    const raw = authenticated ? livePositions : [];
    return raw.map((p) => {
      const liveLtp = quoteMap[p.symbol]?.ltp ?? p.ltp ?? p.avg;
      const mtm = +((liveLtp - p.avg) * p.qty).toFixed(2);
      return { ...p, ltp: +Number(liveLtp).toFixed(2), pnl: mtm };
    });
  }, [authenticated, livePositions, quoteMap]);
  const totalUnrealizedMtm = useMemo(
    () => positionsWithLiveMtm.reduce((s, p) => s + Number(p.pnl || 0), 0),
    [positionsWithLiveMtm],
  );
  const tradesToShow = authenticated ? liveTrades : [];

  // Account Guardrail Calculations (live synced with Instant Funding, 1-Step, & Classic rules)
  const riskSnap = useMemo(
    () =>
      computeAccountRiskSnapshot({
        account: activeAccount,
        trades: tradesToShow,
        positions: positionsWithLiveMtm,
        orders: ordersToShow,
        quoteMap,
        evaluationRisk,
      }),
    [
      activeAccount,
      tradesToShow,
      positionsWithLiveMtm,
      ordersToShow,
      quoteMap,
      evaluationRisk,
    ],
  );
  const isInstant = riskSnap.product_type === PRODUCT_TYPES.INSTANT;
  const isOneStep = riskSnap.product_type === PRODUCT_TYPES.ONE_STEP;
  const isOneStepFunded =
    riskSnap.product_type === PRODUCT_TYPES.ONE_STEP_FUNDED;

  const acctCap = riskSnap.starting_capital;
  const acctBal = riskSnap.current_balance;
  const acctEquity = riskSnap.current_equity;
  const targetPct = riskSnap.profit_target_pct;
  const dailyLossPct = riskSnap.daily_loss_limit_pct;
  const maxLossPct = riskSnap.max_loss_limit_pct;
  const maxTradesPerDay = isClassicProduct(activeAccount)
    ? Number(
        activeAccount?.trades_per_day ?? evaluationRisk.trades_per_day ?? 5,
      )
    : Number(activeAccount?.trades_per_day ?? 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTradesCount = ordersToShow.filter((o) =>
    String(o.created_at || "").startsWith(todayStr),
  ).length;
  const todayRealized = tradesToShow
    .filter((t) => String(t.created_at || t.out || "").startsWith(todayStr))
    .reduce((s, t) => s + Number(t.pnl || 0), 0);

  const targetAmt = Math.round(riskSnap.profit_target_amt);
  const netProfit = riskSnap.net_profit;
  const targetProgressPct = riskSnap.profit_target_progress_pct;

  const dailyLossLimitAmt = Math.round(riskSnap.daily_loss_limit_amt);
  const dailyUsed = riskSnap.daily_loss;
  const dayLossRoom = riskSnap.daily_loss_room;
  const dayRoomPct =
    dailyLossLimitAmt > 0
      ? Math.max(0, Math.min(100, (dayLossRoom / dailyLossLimitAmt) * 100))
      : 100;

  const maxLossLimitAmt = Math.round((acctCap * maxLossPct) / 100);
  const maxUsed = riskSnap.overall_drawdown;
  const maxLossRoom = riskSnap.overall_loss_room;
  const maxRoomPct =
    maxLossLimitAmt > 0
      ? Math.max(0, Math.min(100, (maxLossRoom / maxLossLimitAmt) * 100))
      : 100;

  const selectIndexOrInstrument = (nextSym) => {
    const clean = String(nextSym || "NIFTY").toUpperCase();
    setSym(clean);
    setTicketSym(clean);
    setMobileWatchlistOpen(false);
    const maybeUnderlying = extractUnderlyingFromSymbol(clean);
    if (
      OPTION_UNDERLYINGS.some(
        (u) => u.symbol === clean || u.symbol === maybeUnderlying,
      )
    ) {
      setOptionUnderlying(
        OPTION_UNDERLYINGS.some((u) => u.symbol === clean)
          ? clean
          : maybeUnderlying,
      );
    }
  };

  const pickSearchInstrument = (item) => {
    if (!watchlistSymbols.includes(item.symbol)) {
      setWatchlistSymbols((prev) => [item.symbol, ...prev]);
    }
    setExchangeFilter("ALL");
    setWatchFilter("ALL");
    selectIndexOrInstrument(item.symbol);
    setSearchQuery("");
    setSearchResults([]);
    setMobileWatchlistOpen(false);
  };

  const executeOrderDirect = async ({
    symbol: orderSym,
    side: orderSide,
    qty: orderQty,
    type: ordType = orderType,
    limitPriceVal = limitPrice,
    productVal = product,
    slVal = stoploss,
    tgtVal = target,
    noteVal = note,
  }) => {
    if (isAccountFailed) {
      setConfirm(false);
      setTicketOpen(false);
      toast.error(
        activeAccount?.breach_reason ||
          "This account has failed due to a risk breach and trading is disabled.",
      );
      return;
    }
    if (isAccountPassed) {
      setConfirm(false);
      setTicketOpen(false);
      toast.info(
        "This 1-Step Challenge has passed! Switch to your Funded account to continue trading.",
      );
      return;
    }
    if (
      !authenticated ||
      !hasActiveAccount ||
      !activeAccount ||
      Number(activeAccount.balance || 0) <= 0
    ) {
      setConfirm(false);
      setTicketOpen(false);
      setPurchasePopup(true);
      return;
    }
    try {
      const cleanNote = String(noteVal || "").trim();
      const res = await placeOrder({
        symbol: orderSym,
        side: orderSide,
        qty: orderQty,
        type: ordType,
        limit_price:
          ordType === "LIMIT" ? Number(limitPriceVal) || undefined : undefined,
        product: productVal,
        stoploss: slVal ? Number(slVal) : null,
        target: tgtVal ? Number(tgtVal) : null,
        expiry_label: selectedExpiry.label,
        note: cleanNote,
      });
      setConfirm(false);
      setTicketOpen(false);
      setNote("");
      toast.success(
        `${orderSide} ${orderQty} ${orderSym} (${ordType}) — ${res?.order?.status?.toLowerCase() || "executed"}`,
      );
    } catch (err) {
      if (err?.response?.data?.code === "NO_ACTIVE_ACCOUNT") {
        setConfirm(false);
        setTicketOpen(false);
        setPurchasePopup(true);
        return;
      }
      if (err?.response?.data?.code === "ACCOUNT_FAILED") {
        setConfirm(false);
        setTicketOpen(false);
        refreshTrader();
      }
      toast.error(formatApiError(err?.response?.data?.detail, "Order failed"));
    }
  };

  const openOptionOrSpotTicket = (
    contractSymbol,
    desiredSide = "BUY",
    suggestedLtp = null,
  ) => {
    if (isAccountFailed) {
      toast.error(
        activeAccount?.breach_reason ||
          "This account has failed due to a risk breach and trading is disabled.",
      );
      return;
    }
    if (isAccountPassed) {
      toast.info(
        "This 1-Step Challenge has passed! Switch to your Funded account to place trades.",
      );
      return;
    }
    const clean = String(contractSymbol || sym).toUpperCase();
    if (!watchlistSymbols.includes(clean)) {
      setWatchlistSymbols((prev) => [clean, ...prev]);
    }
    setSym(clean);
    setTicketSym(clean);
    setSuggestedTicketLtp(Number(suggestedLtp) > 0 ? Number(suggestedLtp) : 0);
    setSide(desiredSide);
    setOrderType("MARKET");
    if (suggestedLtp) setLimitPrice(String(suggestedLtp));

    if (
      !authenticated ||
      !hasActiveAccount ||
      !activeAccount ||
      Number(activeAccount.balance || 0) <= 0
    ) {
      setPurchasePopup(true);
      return;
    }
    if (lightningMode && oneClick) {
      const contractLot =
        quoteMap[clean]?.lot ||
        (clean.endsWith("CE") || clean.endsWith("PE")
          ? getOptionSpec(extractUnderlyingFromSymbol(clean)).lot
          : 1);
      executeOrderDirect({
        symbol: clean,
        side: desiredSide,
        qty: Math.max(1, lots) * contractLot,
      });
      return;
    }
    setTicketOpen(true);
  };

  const hasBlockingModalOpen =
    confirm ||
    Boolean(noteEditor) ||
    feedbackOpen ||
    guideOpen ||
    basketOpen ||
    purchasePopup ||
    mobileWatchlistOpen ||
    mobileMenuOpen;

  useKeyboardShortcuts({
    b: (e) => {
      if (hasBlockingModalOpen) return;
      e.preventDefault();
      if (embedded || ticketOpen) {
        setSide("BUY");
      } else {
        openOptionOrSpotTicket(sym, "BUY", chartLtp);
      }
    },
    s: (e) => {
      if (hasBlockingModalOpen) return;
      e.preventDefault();
      if (embedded || ticketOpen) {
        setSide("SELL");
      } else {
        openOptionOrSpotTicket(sym, "SELL", chartLtp);
      }
    },
    l: () => {
      if (embedded || hasBlockingModalOpen || ticketOpen) return;
      setLightningMode((v) => !v);
      setActiveTab("Trade");
    },
    f: () => {
      if (embedded || hasBlockingModalOpen || ticketOpen) return;
      setFullscreenChart((v) => !v);
    },
    Escape: () => {
      if (confirm) setConfirm(false);
      else if (noteEditor) setNoteEditor(null);
      else if (feedbackOpen) setFeedbackOpen(false);
      else if (guideOpen) setGuideOpen(false);
      else if (basketOpen) setBasketOpen(false);
      else if (purchasePopup) setPurchasePopup(false);
      else if (ticketOpen) setTicketOpen(false);
      else if (mobileWatchlistOpen) setMobileWatchlistOpen(false);
      else if (mobileMenuOpen) setMobileMenuOpen(false);
      else if (fullscreenChart) setFullscreenChart(false);
    },
  });

  const handlePlaceClick = () => {
    if (isAccountFailed) {
      toast.error(
        activeAccount?.breach_reason ||
          "This account has failed due to a risk breach and trading is disabled.",
      );
      return;
    }
    if (isAccountPassed) {
      toast.info(
        "This 1-Step Challenge has passed! Switch to your Funded account to place trades.",
      );
      return;
    }
    if (
      !authenticated ||
      !hasActiveAccount ||
      !activeAccount ||
      Number(activeAccount.balance || 0) <= 0
    ) {
      setPurchasePopup(true);
      return;
    }
    setConfirm(true);
  };

  const handleSubmitOrder = async () => {
    if (!execEstPrice) {
      toast.error("Waiting for live price before placing order.");
      return;
    }
    await executeOrderDirect({
      symbol: effectiveTicketSym,
      side,
      qty,
      type: orderType,
      limitPriceVal: limitPrice,
      productVal: product,
      slVal: stoploss,
      tgtVal: target,
      noteVal: note,
    });
  };

  const handleClosePosition = async (pos) => {
    if (!authenticated || !pos.id) return;
    try {
      const res = await closePosition(pos.id);
      const realized = res?.trade?.pnl ?? 0;
      toast.success(
        `Closed ${pos.symbol} (${realized >= 0 ? "+" : "−"}${formatINR(Math.abs(realized))})`,
      );
    } catch (err) {
      if (err?.response?.data?.code === "NO_ACTIVE_ACCOUNT") {
        setPurchasePopup(true);
        return;
      }
      toast.error(
        formatApiError(
          err?.response?.data?.detail,
          "Unable to square off position",
        ),
      );
    }
  };

  const handleSquareOffAll = async () => {
    if (!authenticated || !positionsWithLiveMtm.length) return;
    try {
      const res = await closeAllPositions(activeAccount?.id);
      toast.success(
        `Squared off ${res?.closed || 0} position(s) (${signed(res?.total_pnl || 0)})`,
      );
    } catch (err) {
      toast.error(
        formatApiError(err?.response?.data?.detail, "Unable to square off all"),
      );
    }
  };

  const handleCancelOrder = async (orderId) => {
    try {
      await cancelOrder(orderId);
      toast.success("Pending order cancelled");
    } catch (err) {
      toast.error(
        formatApiError(err?.response?.data?.detail, "Could not cancel order"),
      );
    }
  };

  const saveEditedNote = async (e) => {
    e.preventDefault();
    if (!noteEditor) return;
    try {
      await updateNote(noteEditor.kind, noteEditor.id, noteEditor.note);
      toast.success("Trade note updated");
      setNoteEditor(null);
    } catch (err) {
      toast.error(
        formatApiError(err?.response?.data?.detail, "Could not update note"),
      );
    }
  };

  const submitFeedback = async (e) => {
    e.preventDefault();
    if (
      feedbackForm.subject.trim().length < 4 ||
      feedbackForm.message.trim().length < 10
    ) {
      toast.error(
        "Please add a subject (min 4 chars) and message (min 10 chars).",
      );
      return;
    }
    setSendingFeedback(true);
    try {
      await api.post("/me/tickets", {
        subject: feedbackForm.subject,
        message: feedbackForm.message,
        category: "Trading",
      });
      toast.success("Feedback sent to the IndiFunded desk");
      setFeedbackForm({ subject: "", message: "" });
      setFeedbackOpen(false);
    } catch (err) {
      toast.error(
        formatApiError(err?.response?.data?.detail, "Could not send feedback"),
      );
    } finally {
      setSendingFeedback(false);
    }
  };

  // Reusable Watchlist Panel
  const WatchlistPanel = (
    <aside
      className="term-panel p-3.5 watchlist-panel flex flex-col"
      aria-label="NSE and BSE Watchlist"
    >
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center gap-1.5"
              title={
                searchLocked ? "Purchase a challenge to unlock" : undefined
              }
              data-testid="terminal-search-wrapper"
            >
              <div className="relative flex-1 min-w-0">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-2)]"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  disabled={searchLocked}
                  title={
                    searchLocked ? "Purchase a challenge to unlock" : undefined
                  }
                  className={`input-dark !pl-8 !pr-7 !py-1.5 text-xs ${
                    searchLocked ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  placeholder={
                    searchLocked
                      ? "Purchase a challenge to unlock…"
                      : "Search NIFTY 25500 CE, RELIANCE…"
                  }
                  value={searchLocked ? "" : searchQuery}
                  onChange={(e) => {
                    if (searchLocked) {
                      promptSearchUnlock();
                      return;
                    }
                    setSearchQuery(e.target.value);
                  }}
                  data-testid="terminal-search-input"
                />
                {searchLocked ? (
                  <button
                    type="button"
                    onClick={promptSearchUnlock}
                    title="Purchase a challenge to unlock"
                    aria-label="Purchase a challenge to unlock"
                    className="absolute inset-0 rounded-lg cursor-not-allowed bg-transparent"
                    data-testid="terminal-search-lock-overlay"
                  />
                ) : (
                  searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-2)] hover:text-[var(--text)]"
                      aria-label="Clear search"
                    >
                      <X size={12} />
                    </button>
                  )
                )}
              </div>
              <button
                type="button"
                onClick={handleSearchTrigger}
                aria-label={
                  searchLocked
                    ? "Purchase a challenge to unlock"
                    : "Search symbols"
                }
                title={
                  searchLocked
                    ? "Purchase a challenge to unlock"
                    : "Search symbols"
                }
                className={`shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-mono inline-flex items-center gap-1 border transition ${
                  searchLocked
                    ? "border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--emerald)]"
                    : "border-[var(--border-hi)] bg-[var(--bg-2)] text-[var(--text)] hover:border-[var(--accent)]"
                }`}
                data-testid="terminal-search-btn"
              >
                {searchLocked ? <Lock size={12} /> : <Search size={12} />}
                <span className="hidden sm:inline">
                  {searchLocked ? "Locked" : "Find"}
                </span>
              </button>
            </div>
          </TooltipTrigger>
          {searchLocked && (
            <TooltipContent
              side="bottom"
              className="bg-[var(--bg-2)] text-[var(--text)] border border-[var(--border-hi)] shadow-lg"
              data-testid="terminal-search-tooltip"
            >
              Purchase a challenge to unlock
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      {searchLocked && (
        <div
          className="mt-2 text-[11px] text-[var(--muted-2)] flex items-center gap-1.5"
          data-testid="terminal-search-locked-hint"
        >
          <Lock size={11} className="text-[var(--accent)] shrink-0" />
          <span>Purchase a challenge to unlock symbol search.</span>
        </div>
      )}

      {!searchLocked && searchQuery.trim() ? (
        <div
          className="watchlist-scroll mt-2.5 divide-y divide-[var(--border)] flex-1"
          data-testid="terminal-search-results"
        >
          {searching ? (
            <div className="text-xs text-[var(--muted)] py-4 text-center">
              Searching NSE, BSE &amp; Options…
            </div>
          ) : searchResults.length ? (
            searchResults.map((item) => (
              <button
                key={item.providerSymbol}
                type="button"
                onClick={() => pickSearchInstrument(item)}
                data-testid={`search-result-${item.symbol}`}
                className="watchlist-row w-full text-left"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-[var(--text)] flex items-center gap-1.5 flex-wrap">
                    <span>{item.symbol}</span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-2)] text-[var(--muted-2)]">
                      {item.exchange}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--muted-2)] truncate">
                    {item.name}
                    {item.lot > 1 ? ` · Lot ${item.lot}` : ""}
                  </div>
                </div>
                <span className="text-[11px] text-[var(--emerald)] font-mono shrink-0">
                  + Load
                </span>
              </button>
            ))
          ) : (
            <div className="text-xs text-[var(--muted)] py-4 text-center">
              Try NIFTY 25500 CE or RELIANCE.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="seg w-full mt-2.5">
            {[
              ["ALL", "All"],
              ["NSE", "NSE"],
              ["BSE", "BSE"],
            ].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                className={`flex-1 !py-1 !text-[11px] ${exchangeFilter === k ? "is-on" : ""}`}
                onClick={() => setExchangeFilter(k)}
                data-testid={`exch-filter-${k.toLowerCase()}`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="flex gap-1 mt-2 overflow-x-auto pb-0.5">
            {[
              ["ALL", "All"],
              ["STARRED", "★ Starred"],
              ["OPTION", "Options"],
              ["INDEX", "Indices"],
              ["EQUITY", "Shares"],
            ].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setWatchFilter(k)}
                data-testid={`kind-filter-${k.toLowerCase()}`}
                className={`px-2 py-1 rounded-lg text-[10px] font-mono whitespace-nowrap border transition ${
                  watchFilter === k
                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="watchlist-scroll mt-2 divide-y divide-[var(--border)] flex-1 !max-h-[490px] custom-scrollbar">
            {quotesLoading && !filteredWatchQuotes.length ? (
              <div className="text-xs text-[var(--muted)] py-6 text-center">
                Fetching live NSE &amp; BSE quotes…
              </div>
            ) : !filteredWatchQuotes.length ? (
              <div className="text-xs text-[var(--muted)] py-6 text-center">
                No quotes available for this selection. Try refreshing.
              </div>
            ) : (
              filteredWatchQuotes.map((q) => {
                const active = q.symbol === sym;
                const up = q.changePct >= 0;
                const flash = flashMap[q.symbol];
                const isStarred = starredSymbols.includes(q.symbol);
                return (
                  <div
                    key={q.symbol}
                    className={`watchlist-row w-full text-left tabular-nums group ${
                      active ? "is-selected" : ""
                    } ${flash ? `tick-${flash}` : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleStar(q.symbol)}
                      className={`shrink-0 p-0.5 rounded transition ${
                        isStarred
                          ? "text-amber-400"
                          : "text-[var(--muted-2)] opacity-45 hover:opacity-100"
                      }`}
                      aria-label={`Star ${q.symbol}`}
                    >
                      <Star
                        size={11}
                        fill={isStarred ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => selectIndexOrInstrument(q.symbol)}
                      data-testid={`watch-${q.symbol}`}
                      className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
                          <span className="truncate">{q.symbol}</span>
                          <span className="text-[10px] text-[var(--muted-2)] font-normal shrink-0">
                            {q.kind === "OPTION" ? "OPT" : q.exchange}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-[var(--muted-2)] truncate">
                          {q.name}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs font-semibold text-[var(--text)]">
                          {q.kind === "INDEX"
                            ? formatPrice(q.ltp)
                            : `₹${formatPrice(q.ltp)}`}
                        </div>
                        <div
                          className={`text-[10.5px] font-mono ${
                            up ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                          }`}
                        >
                          {up ? "+" : ""}
                          {q.changePct.toFixed(2)}%
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </aside>
  );

  // Reusable Quick Strikes Panel
  const QuickStrikesPanel = (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-[var(--text)]">
            Quick strikes
          </div>
          <div className="text-[10px] text-[var(--muted-2)]">
            {optionUnderlying} · spot-linked simulated option premiums
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!embedded && (
            <button
              type="button"
              onClick={() => setBasketOpen(true)}
              className="text-[10px] font-mono px-2 py-1 rounded-lg border border-[var(--border-hi)] bg-[var(--bg-2)] text-[var(--text)] hover:border-[var(--accent)] inline-flex items-center gap-1"
            >
              <Layers size={10} className="text-[var(--emerald)]" /> Basket
            </button>
          )}
          {!embedded && (
            <button
              type="button"
              onClick={() => setActiveTab("Chain")}
              className="text-[11px] font-medium text-[var(--emerald)] hover:underline inline-flex items-center gap-0.5"
            >
              Full chain <ArrowRight size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Underlying switcher */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"].map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setOptionUnderlying(u)}
            className={`px-2 py-1 rounded-lg text-[10px] font-mono border transition ${
              optionUnderlying === u
                ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                : "border-[var(--border)] bg-[var(--bg-2)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      {/* Expiry Pills */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {expiries.map((exp, idx) => (
          <button
            key={exp.id}
            type="button"
            onClick={() => setExpiryIdx(idx)}
            className={`px-2 py-1 rounded-lg text-[10px] font-mono whitespace-nowrap border transition ${
              expiryIdx === idx
                ? "border-[var(--emerald)] bg-[var(--accent-soft)] text-[var(--emerald)] font-semibold"
                : "border-[var(--border)] text-[var(--muted-2)] hover:text-[var(--text)]"
            }`}
          >
            {exp.label}
          </button>
        ))}
      </div>

      {/* Quick Strikes Table */}
      <div className="rounded-xl border border-[var(--border)] overflow-hidden tabular-nums">
        <div className="grid grid-cols-[1fr_78px_1fr] bg-[var(--bg-2)] text-[9px] font-mono uppercase tracking-wider text-[var(--muted-2)] px-2 py-1.5 border-b border-[var(--border)]">
          <span className="text-left text-[var(--emerald)]">Call Buy</span>
          <span className="text-center">Strike</span>
          <span className="text-right text-[var(--rose)]">Put Buy</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {optionChain.rows.map((r) => (
            <div
              key={r.strike}
              className={`grid grid-cols-[1fr_78px_1fr] items-center px-1.5 py-1 text-xs ${
                r.isAtm
                  ? "bg-[var(--accent-soft)]/50"
                  : "hover:bg-[var(--bg-2)]/60"
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  openOptionOrSpotTicket(r.ceSymbol, "BUY", r.ce.ltp)
                }
                className="flex items-center gap-1.5 text-left px-1.5 py-1 rounded-lg hover:bg-[var(--emerald)]/15 transition group"
                title={`Buy ${r.ceSymbol}`}
              >
                <span className="w-5 h-5 rounded bg-[var(--accent)] text-white text-[10px] font-mono font-bold grid place-items-center shrink-0">
                  B
                </span>
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-[var(--emerald)] text-[11px] truncate">
                    ₹{formatPrice(r.ce.ltp)}
                  </div>
                  <div className="text-[9px] font-mono text-[var(--muted-2)] truncate">
                    LTP {formatPrice(r.ce.ltp, 0)}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectIndexOrInstrument(r.ceSymbol)}
                className="text-center py-0.5 px-1 rounded hover:bg-[var(--bg-2)]"
                title="View option chart"
              >
                <div className="font-mono text-[11px] font-semibold text-[var(--text)]">
                  {r.strike}
                </div>
                {r.isAtm && (
                  <span className="inline-block text-[8px] font-mono uppercase px-1 rounded bg-[var(--accent)] text-white">
                    ATM
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  openOptionOrSpotTicket(r.peSymbol, "BUY", r.pe.ltp)
                }
                className="flex items-center justify-end gap-1.5 text-right px-1.5 py-1 rounded-lg hover:bg-[var(--rose)]/15 transition"
                title={`Buy ${r.peSymbol}`}
              >
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-[var(--rose)] text-[11px] truncate">
                    ₹{formatPrice(r.pe.ltp)}
                  </div>
                  <div className="text-[9px] font-mono text-[var(--muted-2)] truncate">
                    LTP {formatPrice(r.pe.ltp, 0)}
                  </div>
                </div>
                <span className="w-5 h-5 rounded bg-[var(--rose)] text-white text-[10px] font-mono font-bold grid place-items-center shrink-0">
                  B
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Reusable Chart Card
  const MainChartPanel = (heightVal = 380, isFull = false) => (
    <div
      className={`term-panel p-4 sm:p-5 min-w-0 flex flex-col ${
        isFull ? "h-full min-h-0" : "justify-between"
      }`}
    >
      <div className={isFull ? "flex flex-col flex-1 min-h-0" : ""}>
        <div className="flex flex-wrap gap-3 items-center justify-between pb-1.5 shrink-0">
          <div className="flex items-baseline gap-3 flex-wrap tabular-nums">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--muted)]">
              {sym}
              {activeQuote?.kind === "INDEX" ? " SPOT" : ""}
            </span>
            <span
              className={`font-display text-2xl sm:text-3xl font-semibold text-[var(--text)] ${
                flashMap[sym] ? `tick-text-${flashMap[sym]}` : ""
              }`}
            >
              {chartLtp
                ? activeQuote?.kind === "INDEX"
                  ? formatPrice(chartLtp)
                  : `₹${formatPrice(chartLtp)}`
                : "—"}
            </span>
            {activeQuote && (
              <span
                className={`text-xs sm:text-sm font-mono font-medium ${pnlCls(chgPct)}`}
              >
                {activeQuote.change >= 0 ? "+" : ""}
                {formatPrice(activeQuote.change)} ({chgPct >= 0 ? "+" : ""}
                {chgPct.toFixed(2)}%)
              </span>
            )}
            {!embedded && (
              <div className="inline-flex items-center gap-1.5 ml-1">
                <button
                  type="button"
                  onClick={() => openOptionOrSpotTicket(sym, "BUY", chartLtp)}
                  title="Buy (B)"
                  data-testid="terminal-chart-buy-btn"
                  className="px-3 py-1 rounded-lg text-[11px] font-mono font-semibold bg-[var(--emerald)] text-white hover:brightness-110 transition"
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => openOptionOrSpotTicket(sym, "SELL", chartLtp)}
                  title="Sell (S)"
                  data-testid="terminal-chart-sell-btn"
                  className="px-3 py-1 rounded-lg text-[11px] font-mono font-semibold bg-[var(--rose)] text-white hover:brightness-110 transition"
                >
                  SELL
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="seg" role="tablist" aria-label="Timeframe">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tf === t}
                  className={`!px-2.5 !py-1 !text-[11px] font-mono ${tf === t ? "is-on" : ""}`}
                  onClick={() => setTf(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="seg" role="tablist" aria-label="Chart mode">
              <button
                type="button"
                className={`!px-2.5 !py-1 !text-[11px] ${chartMode === "candle" ? "is-on" : ""}`}
                onClick={() => setChartMode("candle")}
              >
                Candles
              </button>
              <button
                type="button"
                className={`!px-2.5 !py-1 !text-[11px] ${chartMode === "area" ? "is-on" : ""}`}
                onClick={() => setChartMode("area")}
              >
                Area
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowEma((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition ${
                showEma
                  ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                  : "border-[var(--border)] text-[var(--muted-2)]"
              }`}
            >
              EMA20
            </button>
            {!embedded && (
              <button
                type="button"
                onClick={() => setFullscreenChart((v) => !v)}
                className="p-1.5 rounded-lg border border-[var(--border-hi)] bg-[var(--bg-2)] text-[var(--muted)] hover:text-[var(--text)]"
                title={
                  fullscreenChart
                    ? "Exit Fullscreen (Esc)"
                    : "Fullscreen Chart (F)"
                }
              >
                {fullscreenChart ? (
                  <Minimize2 size={14} />
                ) : (
                  <Maximize2 size={14} />
                )}
              </button>
            )}
          </div>
        </div>

        <div className={isFull ? "mt-2 flex-1 min-h-0 flex flex-col" : "mt-2"}>
          <CandleChart
            candles={syncedCandles}
            timeframe={tf}
            quote={activeQuote}
            symbol={sym}
            height={heightVal}
            fillContainer={isFull}
            prevClose={activeQuote?.prevClose ?? null}
            loading={candlesLoading}
            refreshing={candlesRefreshing}
            mode={chartMode}
            showEma={showEma}
          />
        </div>
      </div>

      {!isFull && (
        <div className="flex items-center justify-between flex-wrap gap-2 mt-2.5 pt-2.5 border-t border-[var(--border)] text-[11px] font-mono text-[var(--muted-2)]">
          <span>
            Prev Close {activeQuote ? formatPrice(activeQuote.prevClose) : "—"}{" "}
            · Day Range {formatPrice(dayLo, 0)}–{formatPrice(dayHi, 0)}
          </span>
          <span>
            {!embedded
              ? "B: Buy · S: Sell · L: Lightning · F: Fullscreen · Esc: Close"
              : "B: Buy · S: Sell · Esc: Close Modal"}
          </span>
        </div>
      )}
    </div>
  );

  // Reusable Order Ticket Body (used inline in Embedded mode AND inside Slide-Over Modal in Standalone)
  const OrderTicketFields = (
    <div className="space-y-3.5 tabular-nums">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-sm font-semibold text-[var(--text)]">
            {effectiveTicketSym}
          </div>
          <div className="text-[10px] font-mono text-[var(--muted-2)]">
            {effectiveTicketQuote?.exchange || "NSE"} · Lot {lotSize} · LTP{" "}
            <strong className="text-[var(--text)]">
              {formatPrice(ticketLtp)}
            </strong>
          </div>
        </div>
        <div className="seg">
          {["MIS", "NRML"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProduct(p)}
              className={`!px-2.5 !py-1 !text-[10px] font-mono ${product === p ? "is-on" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="seg w-full" role="tablist" aria-label="Side">
        {["BUY", "SELL"].map((s) => (
          <button
            key={s}
            type="button"
            className={`flex-1 ${side === s ? (s === "BUY" ? "is-buy" : "is-sell") : ""}`}
            onClick={() => setSide(s)}
            data-testid={`terminal-side-${s.toLowerCase()}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] font-mono uppercase text-[var(--muted-2)] mb-1">
            Order Type
          </div>
          <div className="seg w-full">
            {["MARKET", "LIMIT"].map((ot) => (
              <button
                key={ot}
                type="button"
                onClick={() => {
                  setOrderType(ot);
                  if (ot === "LIMIT" && !limitPrice && ticketLtp) {
                    setLimitPrice(String(ticketLtp));
                  }
                }}
                className={`flex-1 !py-1 !text-[10px] font-mono ${orderType === ot ? "is-on" : ""}`}
              >
                {ot}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-[var(--muted-2)] mb-1">
            {orderType === "LIMIT" ? "Limit Price" : "Execution"}
          </div>
          {orderType === "LIMIT" ? (
            <input
              type="number"
              step="0.05"
              className="input-dark !py-1.5 text-xs font-mono"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
            />
          ) : (
            <div className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-xs font-mono text-[var(--muted)]">
              Market ({formatPrice(ticketLtp)})
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="dash-label !mt-0" htmlFor="lots">
          {lotSize > 1
            ? `Lots (1 lot = ${lotSize} qty · Total ${qty})`
            : "Quantity (shares)"}
        </label>
        <div className="qty">
          <button
            type="button"
            onClick={() => setLots(Math.max(1, lots - 1))}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            id="lots"
            type="number"
            min="1"
            max="500"
            value={lots}
            onChange={(e) =>
              setLots(Math.min(500, Math.max(1, Number(e.target.value) || 1)))
            }
          />
          <button
            type="button"
            onClick={() => setLots(Math.min(500, lots + 1))}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-1.5">
          {[1, 2, 5, 10].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setLots(preset)}
              className={`py-1 rounded-lg text-[10px] font-mono border transition ${
                lots === preset
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--muted-2)] hover:text-[var(--text)]"
              }`}
            >
              {preset}x
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowSlTarget((v) => !v)}
          className="text-[11px] font-mono text-[var(--emerald)] hover:underline inline-flex items-center gap-1"
        >
          {showSlTarget
            ? "− Hide Stoploss & Target"
            : "+ Add Stoploss & Target"}
        </button>
        {showSlTarget && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="text-[10px] font-mono text-[var(--muted-2)]">
                Stoploss Price
              </label>
              <input
                type="number"
                step="0.05"
                placeholder="Optional"
                className="input-dark !py-1.5 text-xs font-mono mt-1"
                value={stoploss}
                onChange={(e) => setStoploss(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--muted-2)]">
                Target Price
              </label>
              <input
                type="number"
                step="0.05"
                placeholder="Optional"
                className="input-dark !py-1.5 text-xs font-mono mt-1"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label
          className="dash-label !mt-0 flex items-center gap-1.5"
          htmlFor="trade-note"
        >
          <StickyNote size={11} className="text-[var(--emerald)]" />
          Trade note (saved in Trade Book)
        </label>
        <textarea
          id="trade-note"
          rows={2}
          maxLength={400}
          className="input-dark !min-h-[54px] text-xs"
          placeholder="Setup, entry logic, target or stop note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid="terminal-note-input"
        />
      </div>

      <div className="order-summary !my-2 text-xs">
        <div>
          <span>Total Qty</span>
          <strong>{qty}</strong>
        </div>
        <div>
          <span>Est. Margin (20%)</span>
          <strong>{execEstPrice ? inr(marginReq) : "—"}</strong>
        </div>
        <div>
          <span>Order Value</span>
          <strong>{execEstPrice ? inr(estValue) : "—"}</strong>
        </div>
      </div>

      <button
        type="button"
        disabled={
          !ticketLtp || submitting || isAccountFailed || isAccountPassed
        }
        className={`w-full rounded-xl py-2.5 font-semibold text-sm disabled:opacity-50 ${
          side === "BUY" ? "btn-buy" : "btn-sell"
        }`}
        onClick={handlePlaceClick}
        data-testid="terminal-place-btn"
      >
        {isAccountFailed
          ? "Account Failed — Locked"
          : isAccountPassed
            ? "Passed — Switch to Funded"
            : `${side} ${effectiveTicketSym} (${orderType})`}
      </button>
    </div>
  );

  // Common Positions, Orders, Closed tables
  const PositionsBlotter = (
    <div className="term-panel overflow-x-auto">
      <table className="w-full text-xs dash-table tabular-nums">
        <thead>
          <tr>
            <th className="text-left">Instrument</th>
            <th className="text-left">Prod</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Avg</th>
            <th className="text-right">LTP</th>
            <th className="text-right">MTM P&amp;L</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {positionsWithLiveMtm.length ? (
            positionsWithLiveMtm.map((r) => (
              <tr key={r.id || r.symbol}>
                <td>
                  <button
                    type="button"
                    onClick={() => selectIndexOrInstrument(r.symbol)}
                    className="font-mono font-semibold text-[var(--text)] hover:text-[var(--emerald)]"
                  >
                    {r.symbol}
                  </button>
                </td>
                <td className="font-mono text-[var(--muted-2)]">
                  {r.product || "MIS"}
                </td>
                <td
                  className={`text-right font-mono ${
                    r.qty >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                  }`}
                >
                  {r.qty}
                </td>
                <td className="text-right font-mono">{formatPrice(r.avg)}</td>
                <td className="text-right font-mono">{formatPrice(r.ltp)}</td>
                <td
                  className={`text-right font-mono font-semibold ${pnlCls(r.pnl)}`}
                >
                  {signed(r.pnl)}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => handleClosePosition(r)}
                    className="px-2.5 py-1 rounded-lg border border-[var(--rose)]/40 text-[var(--rose)] hover:bg-[var(--rose)]/10 text-[11px] font-medium"
                  >
                    Exit
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="text-center py-8 text-[var(--muted)]">
                No open positions right now.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const OrdersBlotter = (rows, showCancel = false) => (
    <div className="term-panel overflow-x-auto">
      <table className="w-full text-xs dash-table tabular-nums">
        <thead>
          <tr>
            <th className="text-left">Time</th>
            <th className="text-left">Instrument</th>
            <th className="text-left">Type</th>
            <th className="text-left">Side</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Price</th>
            <th className="text-left">Note</th>
            <th className="text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-[var(--muted-2)]">
                  {String(r.date || r.created_at || "")
                    .slice(0, 16)
                    .replace("T", " ")}
                </td>
                <td className="font-mono font-semibold text-[var(--text)]">
                  {r.symbol}
                </td>
                <td className="font-mono text-[var(--muted)]">
                  {r.type} · {r.product || "MIS"}
                </td>
                <td
                  className={`font-semibold ${
                    r.side === "BUY"
                      ? "text-[var(--emerald)]"
                      : "text-[var(--rose)]"
                  }`}
                >
                  {r.side}
                </td>
                <td className="text-right font-mono">{r.qty}</td>
                <td className="text-right font-mono">{formatPrice(r.price)}</td>
                <td>
                  <div className="flex items-center gap-1.5 max-w-[180px]">
                    <span className="truncate text-[var(--muted)]">
                      {r.note || "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setNoteEditor({
                          kind: "order",
                          id: r.id,
                          note: r.note || "",
                        })
                      }
                      className="text-[var(--muted-2)] hover:text-[var(--emerald)]"
                      aria-label="Edit note"
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                </td>
                <td className="text-right">
                  <div className="inline-flex items-center gap-2">
                    <TerminalStatusPill status={r.status} />
                    {showCancel && r.status === "Pending" && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(r.id)}
                        className="text-[10px] font-mono text-[var(--rose)] hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="text-center py-8 text-[var(--muted)]">
                No orders in this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  // Embedded Mode (keeps /virtual-trading compact & passes all Vitest assertions)
  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`live-badge ${marketStatus === "LIVE" ? "is-live" : "is-closed"}`}
            >
              <Radio size={11} />{" "}
              {marketStatus === "LIVE" ? "Market open" : "Market closed"} ·
              prices may be delayed
            </span>
            <span className="text-xs font-mono text-[var(--muted-2)]">
              TradingView Powered Chart · Quick Strikes &amp; Instant Order
              Ticket
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={refreshQuotes}
              className="btn-ghost rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> Refresh prices
            </button>
            <Link
              to={authenticated ? "/app/terminal" : "/login?next=/app/terminal"}
              className="btn-amber rounded-full px-4 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              Open Full Terminal <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {authenticated && activeAccount ? (
          <div className="card-panel p-4 flex flex-wrap items-center justify-between gap-4 tabular-nums">
            <div className="flex items-center gap-3 flex-wrap">
              <label
                htmlFor="acct-select"
                className="text-[11px] uppercase tracking-wider font-mono text-[var(--muted-2)]"
              >
                Account
              </label>
              <select
                id="acct-select"
                value={activeAccount.id}
                onChange={(e) => selectAccount(e.target.value)}
                className="input-dark !w-auto !py-1.5 !px-3 text-xs font-mono"
                data-testid="terminal-account-select"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_number || a.id} · {a.plan_name} ({a.account_type}
                    )
                  </option>
                ))}
              </select>
              <TerminalStatusPill status={activeAccount.status} />
            </div>
            <div className="flex flex-wrap gap-6 text-xs">
              <div>
                <span className="text-[var(--muted-2)] block text-[10px] uppercase font-mono">
                  Balance
                </span>
                <strong className="font-mono text-sm text-[var(--text)]">
                  {inr(activeAccount.balance)}
                </strong>
              </div>
              <div>
                <span className="text-[var(--muted-2)] block text-[10px] uppercase font-mono">
                  Realized P&amp;L
                </span>
                <strong
                  className={`font-mono text-sm ${pnlCls(activeAccount.realized_pnl || 0)}`}
                >
                  {signed(activeAccount.realized_pnl || 0)}
                </strong>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="card-panel p-4 flex flex-wrap items-center justify-between gap-4 border-[var(--accent)]/35 bg-[var(--accent-soft)]"
            data-testid="terminal-unfunded-banner"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center bg-[var(--accent)]/15 text-[var(--emerald)] shrink-0">
                <Lock size={16} />
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">
                  Balance ₹0 — No active purchased plan
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Explore live NSE &amp; BSE prices here. Purchase a challenge
                  plan first to unlock order execution.
                </p>
              </div>
            </div>
            <Link
              to="/challenges"
              className="btn-amber rounded-full px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              Purchase plan <ArrowRight size={13} />
            </Link>
          </div>
        )}

        <div
          className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2"
          data-testid="index-ticker-strip"
        >
          {EXCHANGE_INDEX_SYMBOLS.slice(0, 7).map((idxSym) => {
            const iq = quoteMap[idxSym];
            const isSel = sym === idxSym;
            const up = (iq?.changePct ?? 0) >= 0;
            return (
              <button
                key={idxSym}
                type="button"
                onClick={() => selectIndexOrInstrument(idxSym)}
                className={`rounded-xl px-3 py-2 text-left border transition tabular-nums ${
                  isSel
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--bg-1)] hover:border-[var(--border-hi)]"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-[var(--muted-2)]">
                  <span className="font-semibold text-[var(--text)]">
                    {idxSym}
                  </span>
                  <span>{iq?.exchange || "NSE"}</span>
                </div>
                <div className="font-mono text-sm font-semibold text-[var(--text)] mt-0.5">
                  {iq?.ltp ? formatPrice(iq.ltp) : "—"}
                </div>
                {iq && (
                  <div
                    className={`text-[10px] font-mono ${up ? "text-[var(--emerald)]" : "text-[var(--rose)]"}`}
                  >
                    {up ? "+" : ""}
                    {iq.changePct.toFixed(2)}%
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="terminal-layout">
          {WatchlistPanel}
          {MainChartPanel(400, false)}
          <div className="term-panel p-4 order-panel">{OrderTicketFields}</div>
        </div>

        {authenticated && (
          <div className="grid lg:grid-cols-2 gap-5 pt-2">
            <div>
              <h3 className="font-display text-lg mb-2">
                Open positions ({positionsWithLiveMtm.length})
              </h3>
              {PositionsBlotter}
            </div>
            <div>
              <h3 className="font-display text-lg mb-2">
                Recent orders ({ordersToShow.length})
              </h3>
              {OrdersBlotter(ordersToShow.slice(0, 5), true)}
            </div>
          </div>
        )}

        <TerminalDialogs
          purchasePopup={purchasePopup}
          setPurchasePopup={setPurchasePopup}
          authenticated={authenticated}
          confirm={confirm}
          setConfirm={setConfirm}
          side={side}
          activeAccount={activeAccount}
          sym={effectiveTicketSym}
          activeQuote={effectiveTicketQuote}
          qty={qty}
          price={execEstPrice}
          estValue={estValue}
          note={note}
          submitting={submitting}
          handleSubmitOrder={handleSubmitOrder}
          noteEditor={noteEditor}
          setNoteEditor={setNoteEditor}
          saveEditedNote={saveEditedNote}
          guideOpen={guideOpen}
          setGuideOpen={setGuideOpen}
          guideStep={guideStep}
          setGuideStep={setGuideStep}
          feedbackOpen={feedbackOpen}
          setFeedbackOpen={setFeedbackOpen}
          feedbackForm={feedbackForm}
          setFeedbackForm={setFeedbackForm}
          sendingFeedback={sendingFeedback}
          submitFeedback={submitFeedback}
        />
      </div>
    );
  }

  // Full-Viewport Standalone IndiFunded Web Terminal (/app/terminal)
  const dailyMap = {};
  for (const t of tradesToShow) {
    const d = String(t.out || t.created_at || "").slice(0, 10);
    if (d) dailyMap[d] = (dailyMap[d] || 0) + Number(t.pnl || 0);
  }
  const calEntries = Object.values(dailyMap);
  const bestDay = calEntries.length ? Math.max(...calEntries) : 0;
  const worstDay = calEntries.length ? Math.min(...calEntries) : 0;
  const greenDays = calEntries.filter((v) => v > 0).length;
  const redDays = calEntries.filter((v) => v < 0).length;
  const firstDow = new Date(calCursor.y, calCursor.m, 1).getDay();
  const totalMonthDays = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
  const monthPrefix = `${calCursor.y}-${String(calCursor.m + 1).padStart(2, "0")}`;
  const monthPnl = Object.entries(dailyMap)
    .filter(([k]) => k.startsWith(monthPrefix))
    .reduce((s, [, v]) => s + v, 0);

  // Compute Strategy Basket Legs matching selected template & option chain
  const basketRows = optionChain.rows;
  const basketAtmIdx = Math.max(
    1,
    Math.min(
      basketRows.length - 2,
      basketRows.findIndex((r) => r.isAtm),
    ),
  );
  const atmRow = basketRows[basketAtmIdx] || basketRows[0];
  const otmUpRow =
    basketRows[Math.min(basketRows.length - 1, basketAtmIdx + 2)] || atmRow;
  const otmDnRow = basketRows[Math.max(0, basketAtmIdx - 2)] || atmRow;
  const basketLot = optionChain.spec.lot || 75;

  const basketLegs = useMemo(() => {
    if (!atmRow) return [];
    switch (basketTemplate) {
      case "Short straddle":
        return [
          { symbol: atmRow.ceSymbol, side: "SELL", price: atmRow.ce.bid },
          { symbol: atmRow.peSymbol, side: "SELL", price: atmRow.pe.bid },
        ];
      case "Long strangle":
        return [
          { symbol: otmUpRow.ceSymbol, side: "BUY", price: otmUpRow.ce.ask },
          { symbol: otmDnRow.peSymbol, side: "BUY", price: otmDnRow.pe.ask },
        ];
      case "Short strangle":
        return [
          { symbol: otmUpRow.ceSymbol, side: "SELL", price: otmUpRow.ce.bid },
          { symbol: otmDnRow.peSymbol, side: "SELL", price: otmDnRow.pe.bid },
        ];
      case "Bull call spread":
        return [
          { symbol: atmRow.ceSymbol, side: "BUY", price: atmRow.ce.ask },
          { symbol: otmUpRow.ceSymbol, side: "SELL", price: otmUpRow.ce.bid },
        ];
      case "Bear put spread":
        return [
          { symbol: atmRow.peSymbol, side: "BUY", price: atmRow.pe.ask },
          { symbol: otmDnRow.peSymbol, side: "SELL", price: otmDnRow.pe.bid },
        ];
      case "Iron condor":
        return [
          { symbol: otmUpRow.ceSymbol, side: "SELL", price: otmUpRow.ce.bid },
          { symbol: otmDnRow.peSymbol, side: "SELL", price: otmDnRow.pe.bid },
        ];
      default:
        return [
          { symbol: atmRow.ceSymbol, side: "BUY", price: atmRow.ce.ask },
          { symbol: atmRow.peSymbol, side: "BUY", price: atmRow.pe.ask },
        ];
    }
  }, [basketTemplate, atmRow, otmUpRow, otmDnRow]);

  const basketNetDebit = basketLegs.reduce(
    (s, leg) =>
      s + (leg.side === "BUY" ? 1 : -1) * leg.price * basketLots * basketLot,
    0,
  );
  const basketMarginNeeded = Math.max(
    Math.abs(basketNetDebit),
    basketLegs.reduce(
      (s, leg) => s + leg.price * basketLots * basketLot * 0.25,
      0,
    ),
  );

  const handlePlaceBasket = async () => {
    if (isAccountFailed) {
      setBasketOpen(false);
      toast.error(
        activeAccount?.breach_reason ||
          "This account has failed due to a risk breach and trading is disabled.",
      );
      return;
    }
    if (isAccountPassed) {
      setBasketOpen(false);
      toast.info(
        "This 1-Step Challenge has passed! Switch to your Funded account to place trades.",
      );
      return;
    }
    if (
      !authenticated ||
      !hasActiveAccount ||
      !activeAccount ||
      Number(activeAccount.balance || 0) <= 0
    ) {
      setBasketOpen(false);
      setPurchasePopup(true);
      return;
    }
    try {
      for (const leg of basketLegs) {
        await placeOrder({
          symbol: leg.symbol,
          side: leg.side,
          qty: basketLots * basketLot,
          type: "MARKET",
          product: "NRML",
          expiry_label: selectedExpiry.label,
          note: `${basketTemplate} basket leg`,
        });
      }
      setBasketOpen(false);
      toast.success(`Placed ${basketTemplate} (${basketLegs.length} legs)`);
    } catch (err) {
      if (err?.response?.data?.code === "ACCOUNT_FAILED") {
        setBasketOpen(false);
        refreshTrader();
      }
      toast.error(
        formatApiError(err?.response?.data?.detail, "Basket execution failed"),
      );
    }
  };

  return (
    <div className="term-shell pb-20 lg:pb-0">
      {/* Terminal Top Navigation Bar (Responsive Desktop + Mobile) */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-1)] px-3 sm:px-5 h-13 flex items-center justify-between gap-2 sm:gap-3">
        {/* Desktop Header Left */}
        <div className="hidden lg:flex items-center gap-5 min-w-0">
          <Link
            to="/app"
            className="flex items-center gap-2 shrink-0"
            title="Back to Dashboard"
          >
            <BrandLogo size="sm" />
          </Link>

          <nav
            className="flex items-center gap-1 overflow-x-auto"
            aria-label="Terminal tabs"
          >
            {["Trade", "Chain", "Positions", "Orders", "Account"].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  if (tab !== "Trade" && fullscreenChart)
                    setFullscreenChart(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-2)]"
                }`}
              >
                {tab}
                {tab === "Positions" && positionsWithLiveMtm.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/15">
                    {positionsWithLiveMtm.length}
                  </span>
                )}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setActiveTab("Trade");
                setLightningMode((v) => !v);
                setFullscreenChart(false);
              }}
              title="Toggle Lightning Multi-Chart Mode (Press L)"
              className={`ml-1 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap border transition ${
                lightningMode && activeTab === "Trade"
                  ? "border-[var(--emerald)] bg-[var(--accent-soft)] text-[var(--emerald)]"
                  : "border-[var(--border-hi)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              <Zap size={13} />
              <span>
                {lightningMode && activeTab === "Trade"
                  ? "Standard view"
                  : "Lightning"}
              </span>
            </button>
          </nav>
        </div>

        {/* Mobile Header Left (< lg) */}
        <div className="flex lg:hidden items-center gap-2 min-w-0">
          {lightningMode && activeTab === "Trade" ? (
            <>
              <div
                className="seg !p-0.5"
                role="group"
                aria-label="Charts count"
              >
                {[1, 2].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setLightningChartsCount(cnt)}
                    className={`!px-2 !py-1 !text-[11px] font-mono ${
                      lightningChartsCount === cnt ? "is-on" : ""
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
              <div className="leading-tight tabular-nums min-w-0">
                <div className="text-[9px] font-mono uppercase text-[var(--muted-2)]">
                  EQUITY
                </div>
                <div className="text-xs font-mono font-semibold text-[var(--text)] truncate">
                  {authenticated && activeAccount ? inr(acctEquity) : "₹0"}
                </div>
              </div>
              <div className="leading-tight tabular-nums hidden sm:block">
                <div className="text-[9px] font-mono uppercase text-[var(--muted-2)]">
                  DAY P&amp;L
                </div>
                <div
                  className={`text-xs font-mono font-semibold ${pnlCls(todayRealized + totalUnrealizedMtm)}`}
                >
                  {signed(todayRealized + totalUnrealizedMtm)}
                </div>
              </div>
            </>
          ) : (
            <>
              <Link to="/app" className="shrink-0" title="Back to Dashboard">
                <BrandLogo size="sm" showText={false} />
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[var(--border-hi)] bg-[var(--bg-2)] text-left tabular-nums min-w-0"
              >
                <Wallet size={12} className="text-[var(--emerald)] shrink-0" />
                <div className="leading-tight min-w-0">
                  <div className="text-[9px] font-mono uppercase text-[var(--muted-2)] flex items-center gap-1">
                    <span>EQUITY</span>
                    <span className={pnlCls(totalUnrealizedMtm)}>
                      {signed(totalUnrealizedMtm)}
                    </span>
                  </div>
                  <div className="text-xs font-mono font-semibold text-[var(--text)] truncate">
                    {authenticated && activeAccount
                      ? inr(acctEquity)
                      : "No plan · ₹0"}
                  </div>
                </div>
                <ChevronDown
                  size={12}
                  className="text-[var(--muted)] shrink-0"
                />
              </button>
            </>
          )}
        </div>

        {/* Desktop Right Utilities */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono border ${
              marketStatus === "LIVE"
                ? "border-[var(--emerald)]/40 bg-[var(--accent-soft)] text-[var(--emerald)]"
                : "border-[var(--border-hi)] bg-[var(--bg-2)] text-[var(--muted)]"
            }`}
          >
            <Radio size={10} />
            {marketStatus === "LIVE"
              ? "Market open · prices may be delayed"
              : "Market closed · last available prices"}
          </span>

          {authenticated && activeAccount ? (
            <div className="flex items-center gap-1.5">
              <select
                id="acct-select"
                value={activeAccount.id}
                onChange={(e) => selectAccount(e.target.value)}
                className="input-dark !w-auto !py-1 !px-2.5 text-[11px] font-mono"
                data-testid="terminal-account-select"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_number || a.id} · {inr(a.balance)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Link
              to="/challenges"
              className="btn-amber rounded-lg px-3 py-1.5 text-[11px] font-semibold inline-flex items-center gap-1"
            >
              <Lock size={11} /> No active plan
            </Link>
          )}

          <button
            type="button"
            onClick={() => setBasketOpen(true)}
            title="Strategy Basket Order"
            className="btn-ghost rounded-lg px-2.5 py-1.5 text-[11px] font-medium inline-flex items-center gap-1"
          >
            <Layers size={12} className="text-[var(--emerald)]" /> Basket
          </button>

          <button
            type="button"
            onClick={() => {
              setGuideStep(0);
              setGuideOpen(true);
            }}
            title="Platform Quick Guide"
            aria-label="Open quick guide"
            className="w-8 h-8 rounded-lg border border-[var(--border-hi)] bg-[var(--bg-2)] grid place-items-center text-[var(--muted)] hover:text-[var(--text)]"
          >
            <HelpCircle size={14} />
          </button>

          <button
            type="button"
            onClick={() => {
              refreshQuotes();
              refreshTrader();
            }}
            title="Refresh live quotes & account"
            aria-label="Refresh prices"
            className="w-8 h-8 rounded-lg border border-[var(--border-hi)] bg-[var(--bg-2)] grid place-items-center text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw size={13} />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            title="Toggle Light / Dark theme"
            aria-label="Toggle theme"
            className="w-8 h-8 rounded-lg border border-[var(--border-hi)] bg-[var(--bg-2)] grid place-items-center text-[var(--muted)] hover:text-[var(--text)]"
          >
            {resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <Link
            to="/app"
            className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1"
          >
            <ArrowLeft size={13} />
            <span>Dashboard</span>
          </Link>
        </div>

        {/* Mobile Right Action Icons (< lg) */}
        <div className="flex lg:hidden items-center gap-1.5 shrink-0">
          {lightningMode && activeTab === "Trade" ? (
            <button
              type="button"
              onClick={() => setLightningMode(false)}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-hi)] bg-[var(--bg-2)] text-xs font-medium text-[var(--text)] inline-flex items-center gap-1"
            >
              Standard view
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMobileWatchlistOpen(true)}
                aria-label="Watchlist & Search"
                className="w-8 h-8 rounded-lg border border-[var(--border-hi)] bg-[var(--bg-2)] grid place-items-center text-[var(--muted)] hover:text-[var(--text)]"
              >
                <Search size={14} />
              </button>
              <button
                type="button"
                onClick={() => setBasketOpen(true)}
                aria-label="Basket order"
                className="w-8 h-8 rounded-lg border border-[var(--border-hi)] bg-[var(--bg-2)] grid place-items-center text-[var(--emerald)]"
              >
                <Layers size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("Trade");
                  setLightningMode(true);
                  setFullscreenChart(false);
                }}
                aria-label="Lightning mode"
                className="w-8 h-8 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] grid place-items-center text-[var(--emerald)]"
              >
                <Zap size={14} />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open terminal menu"
            className="w-8 h-8 rounded-lg border border-[var(--border-hi)] bg-[var(--bg-2)] grid place-items-center text-[var(--text)]"
          >
            <Menu size={15} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 p-2.5 sm:p-4 space-y-3 max-w-[1680px] w-full mx-auto">
        {/* Unfunded Banner if no purchased account */}
        {(!authenticated ||
          (!hasActiveAccount && !accounts.length) ||
          !activeAccount) && (
          <div
            className="term-panel p-3 flex flex-wrap items-center justify-between gap-3 border-[var(--accent)]/40 bg-[var(--accent-soft)]"
            data-testid="terminal-unfunded-banner"
          >
            <div className="flex items-center gap-2.5">
              <Lock size={15} className="text-[var(--emerald)] shrink-0" />
              <div className="text-xs text-[var(--text)]">
                <strong>Balance ₹0 — No active purchased plan.</strong> Explore
                live NSE &amp; BSE charts and Option Chains freely. Purchase a
                challenge to unlock order execution.
              </div>
            </div>
            <Link
              to="/challenges"
              className="btn-amber rounded-lg px-3.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
            >
              Purchase plan <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {/* Automated Breach Banner when Selected Account Failed */}
        {authenticated && activeAccount && isAccountFailed && (
          <div
            className="term-panel p-3.5 flex flex-wrap items-center justify-between gap-3 border-[var(--rose)]/45 bg-[var(--rose)]/10"
            data-testid="terminal-failed-banner"
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={16} className="text-[var(--rose)] shrink-0" />
              <div className="text-xs text-[var(--text)]">
                <strong className="text-[var(--rose)]">
                  Account Failed — Trading Disabled:
                </strong>{" "}
                {activeAccount.breach_reason ||
                  "Automated risk breach detected."}{" "}
                {activeAccount.breached_at && (
                  <span className="font-mono text-[11px] text-[var(--muted)]">
                    (
                    {new Date(activeAccount.breached_at).toLocaleString(
                      "en-IN",
                    )}
                    )
                  </span>
                )}
              </div>
            </div>
            <Link
              to={`/app/accounts?account=${encodeURIComponent(activeAccount.id)}`}
              className="btn-ghost rounded-lg px-3.5 py-1.5 text-xs font-medium text-[var(--rose)] inline-flex items-center gap-1"
            >
              View breach details <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {/* 1-Step Challenge Passed Banner */}
        {authenticated && activeAccount && isAccountPassed && (
          <div
            className="term-panel p-3.5 flex flex-wrap items-center justify-between gap-3 border-[var(--emerald)]/45 bg-[var(--emerald)]/10"
            data-testid="terminal-passed-banner"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2
                size={16}
                className="text-[var(--emerald)] shrink-0"
              />
              <div className="text-xs text-[var(--text)]">
                <strong className="text-[var(--emerald)]">
                  1-Step Challenge Passed — Eligible for Funded Account.
                </strong>{" "}
                {activeAccount.linked_funded_account_id
                  ? "Your live 1-Step Funded account is active and ready to trade."
                  : "All challenge conditions met with zero rule violations."}
              </div>
            </div>
            {activeAccount.linked_funded_account_id && (
              <button
                type="button"
                onClick={() =>
                  selectAccount(activeAccount.linked_funded_account_id)
                }
                className="btn-amber rounded-lg px-3.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
              >
                Switch to Funded Account <ArrowRight size={12} />
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-[var(--muted)]" role="status">
          Market quotes may be delayed.{" "}
          {marketStatus === "LIVE" &&
            quotes.some((quote) => quote.tickLive) &&
            "Some prices are simulated while waiting for provider data; they are not executable prices. "}
          Option-chain figures are illustrative, not exchange prices.
        </p>

        {/* Index Strip + Live Guardrails Bar */}
        {!fullscreenChart && (
          <div className="grid xl:grid-cols-[1.5fr_1fr] gap-2.5 sm:gap-3">
            {/* Live Index Selector Cards (Swipeable on Mobile, 6-col Grid on Desktop) */}
            <div
              className="flex overflow-x-auto lg:grid lg:grid-cols-6 gap-2 pb-1 lg:pb-0 custom-scrollbar"
              data-testid="index-ticker-strip"
            >
              {[
                "NIFTY",
                "BANKNIFTY",
                "FINNIFTY",
                "SENSEX",
                "MIDCPNIFTY",
                "BANKEX",
              ].map((idxSym) => {
                const iq = quoteMap[idxSym];
                const isSel = sym === idxSym || optionUnderlying === idxSym;
                const up = (iq?.changePct ?? 0) >= 0;
                return (
                  <button
                    key={idxSym}
                    type="button"
                    onClick={() => selectIndexOrInstrument(idxSym)}
                    className={`min-w-[132px] shrink-0 lg:min-w-0 rounded-xl px-3 py-2 text-left border transition tabular-nums ${
                      flashMap[idxSym] ? `tick-${flashMap[idxSym]}` : ""
                    } ${
                      isSel
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--bg-1)] hover:border-[var(--border-hi)]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--muted-2)]">
                      <span className="font-semibold text-[var(--text)]">
                        {idxSym}
                      </span>
                      <span>{iq?.exchange || "NSE"}</span>
                    </div>
                    <div
                      className={`font-mono text-sm font-semibold text-[var(--text)] mt-0.5 ${
                        flashMap[idxSym] ? `tick-text-${flashMap[idxSym]}` : ""
                      }`}
                    >
                      {iq?.ltp ? formatPrice(iq.ltp) : "—"}
                    </div>
                    {iq && (
                      <div
                        className={`text-[10.5px] font-mono ${
                          up ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                        }`}
                      >
                        {up ? "+" : ""}
                        {iq.changePct.toFixed(2)}%
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 3 Live Evaluation / Funded Guardrails */}
            {!(lightningMode && activeTab === "Trade") && (
              <div className="term-panel p-3 grid grid-cols-3 gap-3 sm:gap-3.5 items-center tabular-nums xl:divide-x xl:divide-[var(--border)]/60 [&>*:not(:first-child)]:xl:pl-3.5">
                {isInstant ? (
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--muted-2)]">
                      <span>3% Buffer ({riskSnap.profit_split}% Split)</span>
                      <span className="text-[var(--text)]">
                        {riskSnap.buffer_satisfied
                          ? "Cleared"
                          : `${Math.round(riskSnap.buffer_progress_pct)}%`}
                      </span>
                    </div>
                    <div className="font-mono text-xs font-semibold text-[var(--text)] mt-0.5 truncate">
                      {riskSnap.buffer_satisfied
                        ? `Withdrawable ${inr(riskSnap.withdrawable_profit)}`
                        : `${inr(Math.max(0, riskSnap.closed_pnl))} / ${inr(riskSnap.buffer_amount)}`}
                    </div>
                    <div className="meter is-ok !mt-1 !h-1.5">
                      <i
                        style={{ width: `${riskSnap.buffer_progress_pct}%` }}
                      />
                    </div>
                  </div>
                ) : isOneStepFunded ? (
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--muted-2)]">
                      <span>Funded ({riskSnap.profit_split}% Split)</span>
                      <span className="text-[var(--emerald)]">LIVE</span>
                    </div>
                    <div className="font-mono text-xs font-semibold text-[var(--text)] mt-0.5 truncate">
                      Net P&amp;L: {signed(netProfit)}
                    </div>
                    <div className="meter is-ok !mt-1 !h-1.5">
                      <i style={{ width: "100%" }} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--muted-2)]">
                      <span>
                        Target ({targetPct}%)
                        {isOneStep
                          ? ` · ${riskSnap.trading_days}/${riskSnap.min_trading_days}d`
                          : ""}
                      </span>
                      <span className="text-[var(--text)]">
                        {Math.round(targetProgressPct)}%
                      </span>
                    </div>
                    <div className="font-mono text-xs font-semibold text-[var(--text)] mt-0.5 truncate">
                      {signed(netProfit)} / {inr(targetAmt)}
                    </div>
                    <div className="meter is-ok !mt-1 !h-1.5">
                      <i style={{ width: `${targetProgressPct}%` }} />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--muted-2)]">
                    <span>Day Loss Room ({dailyLossPct}%)</span>
                    <span>
                      {maxTradesPerDay > 0
                        ? `${todayTradesCount}/${maxTradesPerDay}`
                        : `${todayTradesCount}/∞`}
                    </span>
                  </div>
                  <div className="font-mono text-xs font-semibold text-[var(--emerald)] mt-0.5 truncate">
                    {inr(dayLossRoom)}
                  </div>
                  <div className="meter is-ok !mt-1 !h-1.5">
                    <i style={{ width: `${dayRoomPct}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--muted-2)]">
                    <span>
                      {isInstant
                        ? `Trailing DD (${riskSnap.drawdown_mode.toUpperCase()})`
                        : "Max Loss Room"}
                    </span>
                    <span>{maxLossPct}%</span>
                  </div>
                  <div className="font-mono text-xs font-semibold text-[var(--emerald)] mt-0.5 truncate">
                    {inr(maxLossRoom)}
                    {isInstant
                      ? ` · Flr ${inr(riskSnap.trailing_drawdown_floor)}`
                      : ""}
                  </div>
                  <div className="meter is-ok !mt-1 !h-1.5">
                    <i style={{ width: `${maxRoomPct}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 1: TRADE (Fullscreen OR Lightning OR Standard) */}
        {activeTab === "Trade" && (
          <>
            {fullscreenChart ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="seg">
                    {["BANKNIFTY", "FINNIFTY", "NIFTY"].map((ix) => (
                      <button
                        key={ix}
                        type="button"
                        onClick={() => selectIndexOrInstrument(ix)}
                        className={`!px-2.5 !py-1 !text-[11px] font-mono ${
                          sym === ix ? "is-on" : ""
                        }`}
                      >
                        {ix === "BANKNIFTY"
                          ? "BANK"
                          : ix === "FINNIFTY"
                            ? "FIN"
                            : "NIFTY"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFullscreenChart(false)}
                    className="btn-ghost rounded-lg px-3 py-1 text-xs font-medium inline-flex items-center gap-1"
                  >
                    <Minimize2 size={12} /> Exit
                  </button>
                </div>
                <div className="h-[calc(100vh-110px)] flex flex-col">
                  {MainChartPanel(540, true)}
                </div>
              </div>
            ) : lightningMode ? (
              !isDesktop ? (
                /* Mobile Lightning Stacked Mode (< lg) */
                <div className="lg:hidden space-y-2.5">
                  <div
                    onClick={() => {
                      setLightningFocusedChart("primary");
                      setOptionUnderlying(extractUnderlyingFromSymbol(sym));
                    }}
                    className={`rounded-2xl transition ${
                      lightningFocusedChart === "primary"
                        ? "ring-1 ring-[var(--accent)]"
                        : ""
                    }`}
                  >
                    {MainChartPanel(185, false)}
                  </div>

                  {lightningChartsCount === 2 && (
                    <div
                      onClick={() => {
                        setLightningFocusedChart("secondary");
                        setOptionUnderlying(
                          extractUnderlyingFromSymbol(secondarySym),
                        );
                      }}
                      className={`term-panel p-3 transition ${
                        lightningFocusedChart === "secondary"
                          ? "ring-1 ring-[var(--accent)]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={secondarySym}
                            onChange={(e) => {
                              setSecondarySym(e.target.value);
                              setOptionUnderlying(
                                extractUnderlyingFromSymbol(e.target.value),
                              );
                            }}
                            className="input-dark !w-auto !py-1 !px-2 text-xs font-mono font-semibold"
                          >
                            {[
                              "BANKNIFTY",
                              "NIFTY",
                              "FINNIFTY",
                              "SENSEX",
                              "RELIANCE",
                              "HDFCBANK",
                            ].map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <span className="font-mono text-xs font-semibold text-[var(--text)]">
                            {secondaryQuote?.ltp
                              ? formatPrice(secondaryQuote.ltp)
                              : "—"}
                          </span>
                        </div>
                        <div className="seg">
                          {["1m", "5m", "15m", "1h"].map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setSecondaryTf(t)}
                              className={`!px-1.5 !py-0.5 !text-[10px] font-mono ${
                                secondaryTf === t ? "is-on" : ""
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      <CandleChart
                        candles={secCandles}
                        timeframe={secondaryTf}
                        quote={secondaryQuote}
                        symbol={secondarySym}
                        height={185}
                        loading={secLoading}
                        refreshing={secRefreshing}
                        mode={chartMode}
                        showEma={showEma}
                      />
                    </div>
                  )}

                  {lightningBannerVisible && (
                    <div className="term-panel p-3.5 border-[var(--accent)]/45 bg-[var(--accent-soft)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--emerald)]">
                          Lightning Mode
                        </span>
                        <button
                          type="button"
                          onClick={() => setLightningBannerVisible(false)}
                          className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
                        >
                          Skip
                        </button>
                      </div>
                      <div className="font-display text-sm font-semibold text-[var(--text)]">
                        Your whole desk on one screen
                      </div>
                      <p className="text-xs text-[var(--muted)]">
                        Charts, strikes, order entry, positions and orders — tap
                        either chart to switch Quick Strikes below.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setLightningBannerVisible(false);
                          setGuideStep(7);
                          setGuideOpen(true);
                        }}
                        className="btn-amber rounded-lg px-3.5 py-1.5 text-xs font-semibold"
                      >
                        Show me around
                      </button>
                    </div>
                  )}

                  {/* Mobile Lightning Sub-Tabs: Trade | Positions | Orders */}
                  <div className="seg w-full">
                    {["Trade", "Positions", "Orders"].map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setLightningMobileTab(sub)}
                        className={`flex-1 ${lightningMobileTab === sub ? "is-on" : ""}`}
                      >
                        {sub}
                        {sub === "Positions" && positionsWithLiveMtm.length > 0
                          ? ` (${positionsWithLiveMtm.length})`
                          : ""}
                      </button>
                    ))}
                  </div>

                  {lightningMobileTab === "Trade" && (
                    <div className="space-y-2.5">
                      {/* Quick Order Compact Strip */}
                      <div className="term-panel p-3.5 space-y-3 tabular-nums">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
                            <Zap size={13} className="text-[var(--emerald)]" />{" "}
                            Quick order
                          </div>
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={oneClick}
                              onChange={(e) => setOneClick(e.target.checked)}
                              className="accent-[var(--accent)]"
                            />
                            One-click
                          </label>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <div className="flex-1">
                            <div className="text-[9px] font-mono uppercase text-[var(--muted-2)] mb-1">
                              Lots
                            </div>
                            <div className="qty !my-0">
                              <button
                                type="button"
                                onClick={() => setLots(Math.max(1, lots - 1))}
                                aria-label="Decrease lots"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="1"
                                max="500"
                                value={lots}
                                onChange={(e) =>
                                  setLots(
                                    Math.min(
                                      500,
                                      Math.max(1, Number(e.target.value) || 1),
                                    ),
                                  )
                                }
                              />
                              <button
                                type="button"
                                onClick={() => setLots(Math.min(500, lots + 1))}
                                aria-label="Increase lots"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] font-mono uppercase text-[var(--muted-2)] mb-1">
                              Product
                            </div>
                            <div className="seg">
                              {["MIS", "NRML"].map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setProduct(p)}
                                  className={`!px-2.5 !py-1.5 !text-[10px] font-mono ${
                                    product === p ? "is-on" : ""
                                  }`}
                                >
                                  {p}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <p className="text-[11px] text-[var(--muted)]">
                          Tapping a price{" "}
                          {oneClick
                            ? "buys immediately at market"
                            : "opens the order ticket"}
                          . Switch One-click anytime.
                        </p>
                      </div>

                      {/* Quick Strikes synced to Focused Chart */}
                      <div className="term-panel p-3.5">
                        {QuickStrikesPanel}
                      </div>
                    </div>
                  )}

                  {lightningMobileTab === "Positions" && (
                    <div className="space-y-2.5">
                      {positionsWithLiveMtm.length > 0 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleSquareOffAll}
                            className="text-xs font-mono text-[var(--rose)] hover:underline"
                          >
                            Square off all
                          </button>
                        </div>
                      )}
                      {PositionsBlotter}
                    </div>
                  )}

                  {lightningMobileTab === "Orders" &&
                    OrdersBlotter(ordersToShow.slice(0, 12), true)}
                </div>
              ) : (
                /* Desktop Lightning Mode (>= lg) */
                <div className="hidden lg:grid term-grid-lightning">
                  {/* Left: Dual Charts + Bottom Blotter */}
                  <div className="space-y-3 min-w-0">
                    <div className="grid lg:grid-cols-2 gap-3">
                      {MainChartPanel(340, false)}
                      <div className="term-panel p-4 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <select
                                value={secondarySym}
                                onChange={(e) =>
                                  setSecondarySym(e.target.value)
                                }
                                className="input-dark !w-auto !py-1 !px-2.5 text-xs font-mono font-semibold"
                              >
                                {[
                                  "BANKNIFTY",
                                  "NIFTY",
                                  "FINNIFTY",
                                  "SENSEX",
                                  "RELIANCE",
                                  "HDFCBANK",
                                ].map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                              <span className="font-mono text-sm font-semibold text-[var(--text)]">
                                {secondaryQuote?.ltp
                                  ? formatPrice(secondaryQuote.ltp)
                                  : "—"}
                              </span>
                            </div>
                            <div className="seg">
                              {["1m", "5m", "15m", "1h"].map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setSecondaryTf(t)}
                                  className={`!px-2 !py-0.5 !text-[10px] font-mono ${
                                    secondaryTf === t ? "is-on" : ""
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                          <CandleChart
                            candles={secCandles}
                            timeframe={secondaryTf}
                            quote={secondaryQuote}
                            symbol={secondarySym}
                            height={340}
                            loading={secLoading}
                            refreshing={secRefreshing}
                            mode={chartMode}
                            showEma={showEma}
                          />
                        </div>
                        <div className="text-[10px] font-mono text-[var(--muted-2)] mt-2 pt-2 border-t border-[var(--border)] flex justify-between">
                          <span>Secondary chart monitor</span>
                          <span>Synced live</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Blotter Tabs */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="seg">
                          {[
                            [
                              "Positions",
                              `Positions (${positionsWithLiveMtm.length})`,
                            ],
                            [
                              "Open orders",
                              `Open orders (${pendingOrders.length})`,
                            ],
                            ["Closed", `Closed (${tradesToShow.length})`],
                          ].map(([id, lbl]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setLightningSubTab(id)}
                              className={`!text-xs ${lightningSubTab === id ? "is-on" : ""}`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                        {positionsWithLiveMtm.length > 0 && (
                          <button
                            type="button"
                            onClick={handleSquareOffAll}
                            className="text-xs font-mono text-[var(--rose)] hover:underline"
                          >
                            Square off all
                          </button>
                        )}
                      </div>

                      {lightningSubTab === "Positions" && PositionsBlotter}
                      {lightningSubTab === "Open orders" &&
                        OrdersBlotter(pendingOrders, true)}
                      {lightningSubTab === "Closed" &&
                        OrdersBlotter(tradesToShow.slice(0, 12), false)}
                    </div>
                  </div>

                  {/* Right Column: Quick Order + Quick Strikes */}
                  <div className="space-y-3">
                    <div className="term-panel p-4 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
                          <Zap size={14} className="text-[var(--emerald)]" />{" "}
                          Quick order
                        </div>
                        <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={oneClick}
                            onChange={(e) => setOneClick(e.target.checked)}
                            className="accent-[var(--accent)]"
                          />
                          One-click
                        </label>
                      </div>
                      {OrderTicketFields}
                    </div>
                    <div className="term-panel p-4">{QuickStrikesPanel}</div>
                  </div>
                </div>
              )
            ) : !isDesktop ? (
              /* Mobile Standard View (< lg) */
              <div className="lg:hidden space-y-3">
                {MainChartPanel(285, false)}
                <div className="term-panel p-3.5">{QuickStrikesPanel}</div>
                <div className="term-panel p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text)]">
                      Open positions ({positionsWithLiveMtm.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("Positions")}
                      className="text-[11px] font-medium text-[var(--emerald)] hover:underline"
                    >
                      Manage →
                    </button>
                  </div>
                  {positionsWithLiveMtm.length ? (
                    <div className="space-y-1.5">
                      {positionsWithLiveMtm.map((p) => (
                        <div
                          key={p.id || p.symbol}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] text-xs tabular-nums"
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-semibold text-[var(--text)] truncate">
                              {p.symbol}
                            </div>
                            <div className="text-[10px] font-mono text-[var(--muted-2)]">
                              {p.qty} qty · Avg {formatPrice(p.avg)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`font-mono font-semibold ${pnlCls(p.pnl)}`}
                            >
                              {signed(p.pnl)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleClosePosition(p)}
                              className="px-2 py-1 rounded-lg bg-[var(--rose)]/15 text-[var(--rose)] text-[10px] font-medium"
                            >
                              Exit
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-dashed border-[var(--border-hi)] text-center text-[11px] text-[var(--muted)]">
                      No open positions. Tap a price in Quick strikes to place a
                      trade.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Desktop Standard 3-Column View (>= lg) */
              <div className="hidden lg:grid term-grid-std">
                {/* Left Watchlist */}
                {WatchlistPanel}

                {/* Center Chart */}
                {MainChartPanel(470, false)}

                {/* Right Quick Strikes + Open Positions */}
                <div className="term-panel p-3.5 flex flex-col justify-between gap-4">
                  {QuickStrikesPanel}

                  {/* Open Positions Compact Box */}
                  <div className="pt-3 border-t border-[var(--border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text)]">
                        Open positions ({positionsWithLiveMtm.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveTab("Positions")}
                        className="text-[11px] font-medium text-[var(--emerald)] hover:underline"
                      >
                        Manage →
                      </button>
                    </div>

                    {positionsWithLiveMtm.length ? (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                        {positionsWithLiveMtm.map((p) => (
                          <div
                            key={p.id || p.symbol}
                            className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] text-xs tabular-nums"
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-semibold text-[var(--text)] truncate">
                                {p.symbol}
                              </div>
                              <div className="text-[10px] font-mono text-[var(--muted-2)]">
                                {p.qty} qty · Avg {formatPrice(p.avg)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`font-mono font-semibold ${pnlCls(p.pnl)}`}
                              >
                                {signed(p.pnl)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleClosePosition(p)}
                                className="px-2 py-1 rounded-lg bg-[var(--rose)]/15 text-[var(--rose)] text-[10px] font-medium hover:bg-[var(--rose)]/25"
                              >
                                Exit
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl border border-dashed border-[var(--border-hi)] text-center text-[11px] text-[var(--muted)]">
                        Tap any Call/Put strike above or open an Order Ticket
                        for{" "}
                        <button
                          type="button"
                          onClick={() =>
                            openOptionOrSpotTicket(sym, "BUY", chartLtp)
                          }
                          className="text-[var(--emerald)] underline font-mono"
                        >
                          {sym}
                        </button>
                        .
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB 2: CHAIN (Mobile Calls/Puts Split + Desktop Dual Option Chain) */}
        {activeTab === "Chain" && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--muted)]" role="status">
              Option premiums are derived from live spot quotes using
              Black-Scholes simulated pricing and execute on your active trading
              account.
            </p>
            {isDesktop && (
              <div className="hidden md:block">
                {MainChartPanel(260, false)}
              </div>
            )}

            <div className="term-panel p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="seg overflow-x-auto">
                    {OPTION_UNDERLYINGS.map((u) => (
                      <button
                        key={u.symbol}
                        type="button"
                        onClick={() => {
                          setOptionUnderlying(u.symbol);
                          setSym(u.symbol);
                        }}
                        className={`!px-2.5 !py-1 !text-xs font-mono whitespace-nowrap ${
                          optionUnderlying === u.symbol ? "is-on" : ""
                        }`}
                      >
                        {u.symbol}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 overflow-x-auto">
                    {expiries.map((exp, idx) => (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => setExpiryIdx(idx)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap border ${
                          expiryIdx === idx
                            ? "border-[var(--emerald)] bg-[var(--accent-soft)] text-[var(--emerald)]"
                            : "border-[var(--border)] text-[var(--muted-2)]"
                        }`}
                      >
                        {exp.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-xs font-mono text-[var(--muted)] tabular-nums">
                  Spot{" "}
                  <strong className="text-[var(--text)]">
                    {underlyingQuote?.ltp
                      ? formatPrice(underlyingQuote.ltp)
                      : "Unavailable"}
                  </strong>{" "}
                  · ATM{" "}
                  <strong className="text-[var(--emerald)]">
                    {optionChain.atm}
                  </strong>{" "}
                  · Lot {optionChain.spec.lot}
                </div>
              </div>

              {/* Mobile Calls / Puts Toggle (< md) */}
              <div className="md:hidden space-y-2.5">
                <div className="seg w-full">
                  {[
                    ["CE", "Calls (CE)"],
                    ["PE", "Puts (PE)"],
                  ].map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setChainMobileSide(k)}
                      className={`flex-1 ${chainMobileSide === k ? "is-on" : ""}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs dash-table tabular-nums">
                    <thead>
                      <tr>
                        <th className="text-left !px-2">Strike</th>
                        <th className="text-right !px-2">OI</th>
                        <th className="text-right !px-2">Sell · Bid</th>
                        <th className="text-right !px-2 text-[var(--emerald)]">
                          Buy · Ask
                        </th>
                        <th className="text-center !px-1">★</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optionChain.rows.map((r) => {
                        const leg = chainMobileSide === "CE" ? r.ce : r.pe;
                        const legSym =
                          chainMobileSide === "CE" ? r.ceSymbol : r.peSymbol;
                        const isStarred = starredSymbols.includes(legSym);
                        return (
                          <tr
                            key={r.strike}
                            className={
                              r.isAtm ? "bg-[var(--accent-soft)]/45" : ""
                            }
                          >
                            <td className="font-mono font-semibold text-[var(--text)] !px-2">
                              <div className="flex items-center gap-1">
                                <span>{r.strike}</span>
                                {r.isAtm && (
                                  <span className="text-[8px] px-1 rounded bg-[var(--accent)] text-white">
                                    ATM
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="text-right font-mono text-[var(--muted)] !px-2">
                              {formatLac(leg.oi)}
                            </td>
                            <td className="text-right !px-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openOptionOrSpotTicket(
                                    legSym,
                                    "SELL",
                                    leg.bid,
                                  )
                                }
                                className="font-mono text-[var(--rose)]"
                              >
                                {formatPrice(leg.bid)}
                              </button>
                            </td>
                            <td className="text-right !px-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openOptionOrSpotTicket(legSym, "BUY", leg.ask)
                                }
                                className="px-2 py-1 rounded-lg font-mono font-semibold text-white bg-[var(--accent)]"
                              >
                                {formatPrice(leg.ask)}
                              </button>
                            </td>
                            <td className="text-center !px-1">
                              <button
                                type="button"
                                onClick={() => toggleStar(legSym)}
                                className={
                                  isStarred
                                    ? "text-amber-400"
                                    : "text-[var(--muted-2)]"
                                }
                              >
                                <Star
                                  size={12}
                                  fill={isStarred ? "currentColor" : "none"}
                                />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Desktop Dual Calls + Strike + Puts Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs dash-table tabular-nums">
                  <thead>
                    <tr>
                      <th className="text-center !px-2">★</th>
                      <th className="text-right !px-2">OI</th>
                      <th className="text-right !px-2">VOL</th>
                      <th className="text-right !px-2">SELL (BID)</th>
                      <th className="text-right !px-2 text-[var(--emerald)]">
                        BUY (ASK)
                      </th>
                      <th className="text-center !px-3 bg-[var(--bg-2)]">
                        STRIKE
                      </th>
                      <th className="text-left !px-2 text-[var(--emerald)]">
                        BUY (ASK)
                      </th>
                      <th className="text-left !px-2">SELL (BID)</th>
                      <th className="text-left !px-2">VOL</th>
                      <th className="text-left !px-2">OI</th>
                      <th className="text-center !px-2">★</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optionChain.rows.map((r) => {
                      const ceStarred = starredSymbols.includes(r.ceSymbol);
                      const peStarred = starredSymbols.includes(r.peSymbol);
                      return (
                        <tr
                          key={r.strike}
                          className={
                            r.isAtm ? "bg-[var(--accent-soft)]/35" : ""
                          }
                        >
                          <td className="text-center !px-2">
                            <button
                              type="button"
                              onClick={() => toggleStar(r.ceSymbol)}
                              className={
                                ceStarred
                                  ? "text-amber-400"
                                  : "text-[var(--muted-2)]"
                              }
                            >
                              <Star
                                size={12}
                                fill={ceStarred ? "currentColor" : "none"}
                              />
                            </button>
                          </td>
                          <td className="text-right font-mono text-[var(--muted)] !px-2">
                            {formatLac(r.ce.oi)}
                          </td>
                          <td className="text-right font-mono text-[var(--muted-2)] !px-2">
                            {formatLac(r.ce.vol)}
                          </td>
                          <td className="text-right !px-2">
                            <button
                              type="button"
                              onClick={() =>
                                openOptionOrSpotTicket(
                                  r.ceSymbol,
                                  "SELL",
                                  r.ce.bid,
                                )
                              }
                              className="px-2 py-0.5 rounded font-mono text-[var(--rose)] hover:bg-[var(--rose)]/15"
                            >
                              {formatPrice(r.ce.bid)}
                            </button>
                          </td>
                          <td className="text-right !px-2">
                            <button
                              type="button"
                              onClick={() =>
                                openOptionOrSpotTicket(
                                  r.ceSymbol,
                                  "BUY",
                                  r.ce.ask,
                                )
                              }
                              className="px-2 py-0.5 rounded font-mono font-semibold text-[var(--emerald)] bg-[var(--accent-soft)]/60 hover:bg-[var(--emerald)]/25"
                            >
                              {formatPrice(r.ce.ask)}
                            </button>
                          </td>

                          <td className="text-center font-mono font-semibold text-[var(--text)] bg-[var(--bg-2)] !px-3">
                            {r.strike}
                            {r.isAtm && (
                              <span className="ml-1.5 text-[9px] px-1 rounded bg-[var(--accent)] text-white">
                                ATM
                              </span>
                            )}
                          </td>

                          <td className="text-left !px-2">
                            <button
                              type="button"
                              onClick={() =>
                                openOptionOrSpotTicket(
                                  r.peSymbol,
                                  "BUY",
                                  r.pe.ask,
                                )
                              }
                              className="px-2 py-0.5 rounded font-mono font-semibold text-[var(--emerald)] bg-[var(--accent-soft)]/60 hover:bg-[var(--emerald)]/25"
                            >
                              {formatPrice(r.pe.ask)}
                            </button>
                          </td>
                          <td className="text-left !px-2">
                            <button
                              type="button"
                              onClick={() =>
                                openOptionOrSpotTicket(
                                  r.peSymbol,
                                  "SELL",
                                  r.pe.bid,
                                )
                              }
                              className="px-2 py-0.5 rounded font-mono text-[var(--rose)] hover:bg-[var(--rose)]/15"
                            >
                              {formatPrice(r.pe.bid)}
                            </button>
                          </td>
                          <td className="text-left font-mono text-[var(--muted-2)] !px-2">
                            {formatLac(r.pe.vol)}
                          </td>
                          <td className="text-left font-mono text-[var(--muted)] !px-2">
                            {formatLac(r.pe.oi)}
                          </td>
                          <td className="text-center !px-2">
                            <button
                              type="button"
                              onClick={() => toggleStar(r.peSymbol)}
                              className={
                                peStarred
                                  ? "text-amber-400"
                                  : "text-[var(--muted-2)]"
                              }
                            >
                              <Star
                                size={12}
                                fill={peStarred ? "currentColor" : "none"}
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: POSITIONS */}
        {activeTab === "Positions" && (
          <div className="space-y-3">
            <div className="hidden md:block">{MainChartPanel(280, false)}</div>
            <div className="term-panel p-3.5 grid grid-cols-3 gap-2.5 tabular-nums">
              <div>
                <div className="text-[9px] font-mono uppercase text-[var(--muted-2)]">
                  Unrealised
                </div>
                <div
                  className={`font-mono text-sm sm:text-base font-semibold mt-0.5 ${pnlCls(totalUnrealizedMtm)}`}
                >
                  {signed(totalUnrealizedMtm)}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-mono uppercase text-[var(--muted-2)]">
                  Day P&amp;L
                </div>
                <div
                  className={`font-mono text-sm sm:text-base font-semibold mt-0.5 ${pnlCls(todayRealized + totalUnrealizedMtm)}`}
                >
                  {signed(todayRealized + totalUnrealizedMtm)}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-mono uppercase text-[var(--muted-2)]">
                  Available
                </div>
                <div className="font-mono text-sm sm:text-base font-semibold text-[var(--text)] mt-0.5">
                  {inr(activeAccount?.available_margin ?? acctBal)}
                </div>
              </div>
            </div>
            {positionsWithLiveMtm.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSquareOffAll}
                  className="px-3.5 py-1.5 rounded-xl bg-[var(--rose)] text-white text-xs font-semibold hover:brightness-110"
                >
                  Square off all
                </button>
              </div>
            )}
            {PositionsBlotter}
          </div>
        )}

        {/* TAB 4: ORDERS */}
        {activeTab === "Orders" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="seg">
                {[
                  ["Open", `Open (${pendingOrders.length})`],
                  ["Closed", `Closed Trades (${tradesToShow.length})`],
                  ["All", `All Order History (${ordersToShow.length})`],
                ].map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOrdersSubTab(k)}
                    className={ordersSubTab === k ? "is-on" : ""}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <Link
                to="/app/tradebook"
                className="text-xs text-[var(--emerald)] hover:underline"
              >
                Open full Trade Book →
              </Link>
            </div>

            {ordersSubTab === "Open" && OrdersBlotter(pendingOrders, true)}
            {ordersSubTab === "All" && OrdersBlotter(ordersToShow, true)}
            {ordersSubTab === "Closed" && (
              <div className="term-panel overflow-x-auto">
                <table className="w-full text-xs dash-table tabular-nums">
                  <thead>
                    <tr>
                      <th className="text-left">Trade ID</th>
                      <th className="text-left">Instrument</th>
                      <th className="text-left">Side</th>
                      <th className="text-right">Entry</th>
                      <th className="text-right">Exit</th>
                      <th className="text-right">Qty</th>
                      <th className="text-left">Note</th>
                      <th className="text-right">P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradesToShow.length ? (
                      tradesToShow.map((r) => (
                        <tr key={r.id}>
                          <td className="font-mono text-[var(--muted-2)]">
                            {r.id}
                          </td>
                          <td className="font-mono font-semibold text-[var(--text)]">
                            {r.symbol}
                          </td>
                          <td
                            className={
                              r.side === "BUY"
                                ? "text-[var(--emerald)]"
                                : "text-[var(--rose)]"
                            }
                          >
                            {r.side}
                          </td>
                          <td className="text-right font-mono">
                            {formatPrice(r.entry)}
                          </td>
                          <td className="text-right font-mono">
                            {formatPrice(r.exit)}
                          </td>
                          <td className="text-right font-mono">{r.qty}</td>
                          <td>
                            <div className="flex items-center gap-1.5 max-w-[180px]">
                              <span className="truncate text-[var(--muted)]">
                                {r.note || "—"}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setNoteEditor({
                                    kind: "trade",
                                    id: r.id,
                                    note: r.note || "",
                                  })
                                }
                                className="text-[var(--muted-2)] hover:text-[var(--emerald)]"
                              >
                                <Pencil size={11} />
                              </button>
                            </div>
                          </td>
                          <td
                            className={`text-right font-mono font-semibold ${pnlCls(r.pnl)}`}
                          >
                            {signed(r.pnl)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center py-8 text-[var(--muted)]"
                        >
                          No closed trades yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: ACCOUNT */}
        {activeTab === "Account" && (
          <div className="space-y-4">
            {/* Mobile-friendly top account identity & quick square-off row */}
            <div className="term-panel p-3.5 sm:p-4 flex items-center justify-between gap-3 flex-wrap tabular-nums">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
                  Trading Account · {productBadgeLabel(activeAccount)} ·{" "}
                  {activeAccount?.plan_name || "Evaluation"}
                </div>
                <div className="font-mono text-xs sm:text-sm font-semibold text-[var(--text)] truncate mt-0.5">
                  {user?.email ||
                    activeAccount?.account_number ||
                    "Not signed in"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activeAccount?.account_number && (
                  <span className="px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] font-mono text-[10px] text-[var(--muted)]">
                    #{activeAccount.account_number}
                  </span>
                )}
                <button
                  type="button"
                  disabled={!positionsWithLiveMtm.length}
                  onClick={handleSquareOffAll}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    positionsWithLiveMtm.length
                      ? "bg-[var(--rose)]/15 border-[var(--rose)]/40 text-[var(--rose)] hover:bg-[var(--rose)]/25"
                      : "border-[var(--border)] bg-[var(--bg-2)] text-[var(--muted-2)] opacity-60 cursor-not-allowed"
                  }`}
                >
                  Square off all
                </button>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4 tabular-nums">
              {/* Balances */}
              <div className="term-panel p-3.5 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
                    Balances
                  </div>
                  <span className="text-[10px] font-mono text-[var(--muted)]">
                    Trades today: {todayTradesCount} /{" "}
                    {maxTradesPerDay > 0 ? maxTradesPerDay : "∞"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  {[
                    {
                      k: "Equity",
                      v: inr(acctEquity),
                      cls: "text-[var(--text)]",
                    },
                    {
                      k: "Day P&L",
                      v: signed(todayRealized + totalUnrealizedMtm),
                      cls: pnlCls(todayRealized + totalUnrealizedMtm),
                    },
                    {
                      k: "Realized (Net)",
                      v: signed(activeAccount?.realized_pnl || 0),
                      cls: pnlCls(activeAccount?.realized_pnl || 0),
                    },
                    {
                      k: "Unrealized",
                      v: signed(totalUnrealizedMtm),
                      cls: pnlCls(totalUnrealizedMtm),
                    },
                    {
                      k: "Available Margin",
                      v: inr(activeAccount?.available_margin ?? acctBal),
                      cls: "text-[var(--text)]",
                    },
                    {
                      k: "Margin Used",
                      v: inr(activeAccount?.used_margin || 0),
                      cls: "text-[var(--text)]",
                    },
                    {
                      k: "Charges Today",
                      v: "₹0.00",
                      cls: "text-[var(--muted)]",
                    },
                    {
                      k: "Balance",
                      v: inr(acctBal),
                      cls: "text-[var(--text)]",
                    },
                  ].map((item) => (
                    <div
                      key={item.k}
                      className="dash-subcard p-2.5 sm:p-3 min-w-0"
                    >
                      <div className="text-[10px] font-mono uppercase text-[var(--muted-2)] truncate">
                        {item.k}
                      </div>
                      <div
                        className={`font-mono text-xs sm:text-sm font-semibold mt-1 truncate ${item.cls}`}
                      >
                        {item.v}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Objectives */}
              <div className="term-panel p-3.5 sm:p-5 space-y-3.5">
                <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
                  {isInstant ? "Funded Guardrails & Buffer" : "Objectives"}
                </div>
                {isInstant ? (
                  <div>
                    <div className="flex justify-between text-xs mb-1 gap-2">
                      <span className="text-[var(--muted)]">
                        Reserved 3% Buffer ({riskSnap.profit_split}%{" "}
                        {riskSnap.payout_cycle})
                      </span>
                      <span className="font-mono text-[var(--text)] shrink-0">
                        {riskSnap.buffer_satisfied
                          ? `Cleared · ${inr(riskSnap.withdrawable_profit)} withdrawable`
                          : `${inr(Math.max(0, riskSnap.closed_pnl))} / ${inr(riskSnap.buffer_amount)}`}
                      </span>
                    </div>
                    <div className="meter is-ok !mt-0">
                      <i
                        style={{ width: `${riskSnap.buffer_progress_pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-[var(--muted-2)] mt-1">
                      <span>
                        High watermark: {inr(riskSnap.highest_recorded_equity)}
                      </span>
                      <span>No profit target</span>
                    </div>
                  </div>
                ) : isOneStepFunded ? (
                  <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] text-xs text-[var(--emerald)]">
                    1-Step Funded Account · {riskSnap.profit_split}% Profit
                    Split · No profit target
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between text-xs mb-1 gap-2">
                      <span className="text-[var(--muted)]">
                        Profit target ({targetPct}%)
                      </span>
                      <span className="font-mono text-[var(--text)] shrink-0">
                        {signed(netProfit)} / {inr(targetAmt)}
                      </span>
                    </div>
                    <div className="meter is-ok !mt-0">
                      <i style={{ width: `${targetProgressPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-[var(--muted-2)] mt-1">
                      <span>Goal equity: {inr(acctCap + targetAmt)}</span>
                      <span>
                        {isOneStep
                          ? `Days: ${riskSnap.trading_days}/${riskSnap.min_trading_days} · No time limit`
                          : netProfit >= targetAmt
                            ? "Target achieved"
                            : `${inr(Math.max(0, targetAmt - netProfit))} to go`}
                      </span>
                    </div>
                  </div>
                )}
                <div>
                  <div className="flex justify-between text-xs mb-1 gap-2">
                    <span className="text-[var(--muted)]">
                      Max daily loss ({dailyLossPct}%)
                    </span>
                    <span className="font-mono text-[var(--emerald)] shrink-0">
                      {inr(dayLossRoom)} room
                    </span>
                  </div>
                  <div className="meter is-ok !mt-0">
                    <i style={{ width: `${dayRoomPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[var(--muted-2)] mt-1">
                    <span>Daily floor: {inr(riskSnap.daily_loss_floor)}</span>
                    <span>Used: {inr(dailyUsed)}</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1 gap-2">
                    <span className="text-[var(--muted)]">
                      {isInstant
                        ? `Trailing DD (${maxLossPct}% ${riskSnap.drawdown_mode.toUpperCase()})`
                        : `Max overall loss (${maxLossPct}%)`}
                    </span>
                    <span className="font-mono text-[var(--emerald)] shrink-0">
                      {inr(maxLossRoom)} room
                    </span>
                  </div>
                  <div className="meter is-ok !mt-0">
                    <i style={{ width: `${maxRoomPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[var(--muted-2)] mt-1">
                    <span>Floor: {inr(riskSnap.trailing_drawdown_floor)}</span>
                    <span>Used: {inr(maxUsed)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* P&L Calendar + Rule Events */}
            <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 tabular-nums">
              <div className="term-panel p-3.5 sm:p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
                      P&amp;L Calendar
                    </div>
                    <div className="font-display text-base font-semibold text-[var(--text)] mt-0.5">
                      {new Date(calCursor.y, calCursor.m, 1).toLocaleString(
                        "en-IN",
                        {
                          month: "long",
                          year: "numeric",
                        },
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span>
                      Month:{" "}
                      <strong className={pnlCls(monthPnl)}>
                        {signed(monthPnl)}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCalCursor((c) =>
                          c.m === 0
                            ? { y: c.y - 1, m: 11 }
                            : { y: c.y, m: c.m - 1 },
                        )
                      }
                      className="btn-ghost p-1.5 rounded-lg"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCalCursor((c) =>
                          c.m === 11
                            ? { y: c.y + 1, m: 0 }
                            : { y: c.y, m: c.m + 1 },
                        )
                      }
                      className="btn-ghost p-1.5 rounded-lg"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="dash-subcard p-2.5">
                    <div className="text-[10px] text-[var(--muted-2)]">
                      Best day
                    </div>
                    <div className="font-mono font-semibold text-[var(--emerald)] mt-0.5">
                      {signed(bestDay)}
                    </div>
                  </div>
                  <div className="dash-subcard p-2.5">
                    <div className="text-[10px] text-[var(--muted-2)]">
                      Worst day
                    </div>
                    <div className="font-mono font-semibold text-[var(--rose)] mt-0.5">
                      {signed(worstDay)}
                    </div>
                  </div>
                  <div className="dash-subcard p-2.5">
                    <div className="text-[10px] text-[var(--muted-2)]">
                      Green / Red
                    </div>
                    <div className="font-mono font-semibold text-[var(--text)] mt-0.5">
                      {greenDays} / {redDays}
                    </div>
                  </div>
                </div>

                <div className="cal-grid">
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div key={`${d}-${i}`} className="cal-head">
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: firstDow }).map((_, i) => (
                    <div
                      key={`p-${i}`}
                      className="cal-day is-off !min-h-[3rem]"
                    />
                  ))}
                  {Array.from({ length: totalMonthDays }).map((_, i) => {
                    const day = i + 1;
                    const key = `${monthPrefix}-${String(day).padStart(2, "0")}`;
                    const val = dailyMap[key];
                    const has = val !== undefined;
                    return (
                      <div
                        key={key}
                        className={`cal-day !min-h-[3rem] ${
                          has ? (val >= 0 ? "is-up" : "is-down") : ""
                        }`}
                      >
                        <span>{day}</span>
                        {has && <strong>{signed(val)}</strong>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="term-panel p-3.5 sm:p-5 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
                  Rule Events
                </div>
                <div className="space-y-2.5 text-xs">
                  {[
                    isAccountFailed
                      ? [
                          "Account Failed (Breached)",
                          activeAccount?.breach_reason ||
                            "Trading disabled by automated risk engine",
                          "bad",
                        ]
                      : isAccountPassed
                        ? [
                            "1-Step Challenge Passed",
                            activeAccount?.linked_funded_account_id
                              ? "Funded account auto-activated"
                              : "Eligible for funded account",
                            "ok",
                          ]
                        : [
                            hasActiveAccount
                              ? "Account Active"
                              : "Awaiting Challenge Plan",
                            hasActiveAccount
                              ? `${activeAccount?.account_number || activeAccount?.id} verified for trading`
                              : "Purchase a challenge plan to unlock capital",
                            hasActiveAccount ? "ok" : "wait",
                          ],
                    [
                      "Daily Trade Cap",
                      maxTradesPerDay > 0
                        ? `${todayTradesCount} of ${maxTradesPerDay} daily executions used`
                        : `Unlimited daily executions (${todayTradesCount} today)`,
                      maxTradesPerDay > 0 && todayTradesCount >= maxTradesPerDay
                        ? "bad"
                        : "ok",
                    ],
                    [
                      "Max Daily Loss Guard",
                      `${inr(dayLossRoom)} buffer remaining · Floor ${inr(riskSnap.daily_loss_floor)}`,
                      isAccountFailed || dayRoomPct < 25
                        ? isAccountFailed
                          ? "bad"
                          : "wait"
                        : "ok",
                    ],
                    [
                      isInstant
                        ? "Trailing Drawdown Guard"
                        : "Overall Drawdown Guard",
                      `${inr(maxLossRoom)} room · Floor ${inr(riskSnap.trailing_drawdown_floor)}`,
                      isAccountFailed || maxRoomPct < 25
                        ? isAccountFailed
                          ? "bad"
                          : "wait"
                        : "ok",
                    ],
                  ].map(([t, d, tone]) => (
                    <div
                      key={t}
                      className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--text)]">
                          {t}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] mt-0.5">
                          {d}
                        </div>
                      </div>
                      <span className={`status-pill is-${tone} shrink-0`}>
                        {tone.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Appearance & Workspace */}
            <div className="term-panel p-3.5 sm:p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
                  Appearance &amp; Workspace
                </div>
                <div className="seg mt-2">
                  {[
                    ["light", "Light", Sun],
                    ["dark", "Dark", Moon],
                    ["system", "System", Monitor],
                  ].map(([id, lbl, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTheme(id)}
                      className={`inline-flex items-center gap-1.5 ${theme === id ? "is-on" : ""}`}
                    >
                      <Icon size={12} /> {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setGuideStep(0);
                    setGuideOpen(true);
                  }}
                  className="btn-ghost rounded-xl px-3.5 py-2 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Compass size={13} /> Platform guide
                </button>
                <Link
                  to="/app"
                  className="btn-ghost rounded-xl px-3.5 py-2 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <LayoutDashboard size={13} /> Trader dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(true)}
                  className="btn-ghost rounded-xl px-3.5 py-2 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <LifeBuoy size={13} /> Send feedback
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await logout();
                    } finally {
                      nav("/login", { replace: true });
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl border border-[var(--rose)]/40 text-[var(--rose)] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--rose)]/10"
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (< lg) */}
      {!fullscreenChart && (
        <nav
          className="fixed bottom-0 inset-x-0 z-40 h-16 border-t border-[var(--border)] bg-[var(--bg-1)]/95 backdrop-blur grid grid-cols-5 lg:hidden"
          aria-label="Mobile terminal navigation"
        >
          {[
            { id: "Trade", label: "Trade", icon: CandlestickChart },
            { id: "Chain", label: "Chain", icon: Layers },
            {
              id: "Positions",
              label: "Positions",
              icon: TrendingUp,
              badge: positionsWithLiveMtm.length,
            },
            {
              id: "Orders",
              label: "Orders",
              icon: ClipboardList,
              badge: pendingOrders.length,
            },
            { id: "Account", label: "Account", icon: Wallet },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id !== "Trade") setLightningMode(false);
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? "text-[var(--emerald)]" : "text-[var(--muted-2)]"
                }`}
              >
                <div className="relative">
                  <Icon size={17} />
                  {item.badge > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[14px] h-3.5 px-1 rounded-full bg-[var(--accent)] text-white text-[9px] font-mono grid place-items-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Mobile Watchlist / Symbol Search Sheet */}
      <Dialog open={mobileWatchlistOpen} onOpenChange={setMobileWatchlistOpen}>
        <DialogContent className="max-w-md bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)] p-3.5">
          <DialogTitle className="font-display text-base">
            Watchlist &amp; Symbol Search
          </DialogTitle>
          <DialogDescription className="sr-only">
            Browse live NSE &amp; BSE quotes or search for options contracts
          </DialogDescription>
          <div className="mt-2">{WatchlistPanel}</div>
        </DialogContent>
      </Dialog>

      {/* Mobile Hamburger Account & Settings Drawer */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent className="max-w-sm bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)]">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="font-display text-base">
              Account
            </DialogTitle>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
                marketStatus === "LIVE"
                  ? "bg-[var(--accent-soft)] text-[var(--emerald)]"
                  : "bg-[var(--bg-2)] text-[var(--muted)]"
              }`}
            >
              <Radio size={9} /> {marketStatus === "LIVE" ? "LIVE" : "Closed"}
            </span>
          </div>
          <DialogDescription className="text-xs font-mono text-[var(--muted-2)] truncate">
            {user?.email || "Not signed in"}
          </DialogDescription>

          <div className="space-y-4 mt-1">
            {/* Trading Account Picker */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                Trading Account
              </div>
              {accounts.length ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                  {accounts.map((a) => {
                    const isCurrent = activeAccount?.id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          selectAccount(a.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition tabular-nums ${
                          isCurrent
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border)] bg-[var(--bg-2)]"
                        }`}
                      >
                        <div>
                          <div className="font-mono text-xs font-semibold text-[var(--text)]">
                            {a.account_number || a.id}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--muted)]">
                            {inr(a.balance)} · {a.plan_name}
                          </div>
                        </div>
                        {isCurrent && (
                          <Check size={15} className="text-[var(--emerald)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Link
                  to="/challenges"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-amber rounded-xl py-2.5 px-3 text-xs font-semibold w-full inline-flex items-center justify-center gap-1.5"
                >
                  Purchase a challenge plan <ArrowRight size={12} />
                </Link>
              )}
            </div>

            {/* Appearance Selector */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                Appearance
              </div>
              <div className="seg w-full">
                {[
                  ["light", "Light", Sun],
                  ["dark", "Dark", Moon],
                  ["system", "System", Monitor],
                ].map(([id, lbl, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 ${
                      theme === id ? "is-on" : ""
                    }`}
                  >
                    <Icon size={12} /> {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setGuideStep(0);
                  setGuideOpen(true);
                }}
                className="w-full btn-ghost rounded-xl py-2.5 px-3 text-xs font-medium"
              >
                How to use this platform
              </button>
              <Link
                to="/app"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full btn-ghost rounded-xl py-2.5 px-3 text-xs font-medium block text-center"
              >
                Open trader dashboard
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setFeedbackOpen(true);
                }}
                className="w-full btn-ghost rounded-xl py-2.5 px-3 text-xs font-medium"
              >
                Report a problem or request a feature
              </button>
              <button
                type="button"
                onClick={async () => {
                  setMobileMenuOpen(false);
                  try {
                    await logout();
                  } finally {
                    nav("/login", { replace: true });
                  }
                }}
                className="w-full rounded-xl py-2.5 px-3 text-xs font-medium border border-[var(--rose)]/40 text-[var(--rose)] hover:bg-[var(--rose)]/10"
              >
                Sign out
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Strategy Basket Order Builder Modal */}
      <Dialog open={basketOpen} onOpenChange={setBasketOpen}>
        <DialogContent className="max-w-md bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)] tabular-nums">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
            Basket Order
          </div>
          <DialogTitle className="font-display text-lg">
            Strategy Templates · {optionUnderlying}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Select a multi-leg options strategy template and execute all legs
            together
          </DialogDescription>

          <div className="flex flex-wrap gap-1.5">
            {[
              "Long straddle",
              "Short straddle",
              "Long strangle",
              "Short strangle",
              "Bull call spread",
              "Bear put spread",
              "Iron condor",
            ].map((tpl) => (
              <button
                key={tpl}
                type="button"
                onClick={() => setBasketTemplate(tpl)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                  basketTemplate === tpl
                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                    : "border-[var(--border-hi)] bg-[var(--bg-2)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {tpl}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {basketLegs.map((leg, i) => (
              <div
                key={`${leg.symbol}-${i}`}
                className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-white ${
                        leg.side === "BUY"
                          ? "bg-[var(--emerald)]"
                          : "bg-[var(--rose)]"
                      }`}
                    >
                      {leg.side === "BUY" ? "B" : "S"}
                    </span>
                    <span className="font-mono font-semibold text-[var(--text)]">
                      {leg.symbol}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-[var(--muted-2)] mt-0.5">
                    @ ₹{formatPrice(leg.price)} · NRML · Market
                  </div>
                </div>
                <div className="text-right font-mono text-[11px] text-[var(--text)]">
                  {basketLots} lot ({basketLots * basketLot} qty)
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--muted)]">Lots per leg</span>
            <div className="qty !my-0 !w-32">
              <button
                type="button"
                onClick={() => setBasketLots(Math.max(1, basketLots - 1))}
              >
                −
              </button>
              <input
                type="number"
                min="1"
                max="100"
                value={basketLots}
                onChange={(e) =>
                  setBasketLots(Math.max(1, Number(e.target.value) || 1))
                }
              />
              <button
                type="button"
                onClick={() => setBasketLots(Math.min(100, basketLots + 1))}
              >
                +
              </button>
            </div>
          </div>

          <div className="order-summary !my-1 text-xs">
            <div>
              <span>{basketNetDebit >= 0 ? "Net debit" : "Net credit"}</span>
              <strong>{inr(Math.abs(basketNetDebit))}</strong>
            </div>
            <div>
              <span>Margin needed</span>
              <strong>{inr(basketMarginNeeded)}</strong>
            </div>
            <div>
              <span>Free margin after</span>
              <strong className="text-[var(--emerald)]">
                {inr(
                  Math.max(
                    0,
                    (activeAccount?.available_margin ?? acctBal) -
                      basketMarginNeeded,
                  ),
                )}
              </strong>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting || isAccountFailed || isAccountPassed}
            onClick={handlePlaceBasket}
            className="w-full btn-amber rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {isAccountFailed
              ? "Account Failed — Locked"
              : isAccountPassed
                ? "Passed — Switch to Funded"
                : `Place basket · ${basketLegs.length} legs`}
          </button>
        </DialogContent>
      </Dialog>

      {/* Order Ticket Slide-Over / Modal (for Standard Quick Strikes & Option Chain clicks) */}
      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent className="max-w-md bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)]">
          <DialogTitle className="font-display text-lg">
            Place Order
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--muted)]">
            Simulated execution using the latest available quote, which may be
            delayed, on{" "}
            {activeAccount?.account_number ||
              activeAccount?.id ||
              "active wallet"}
            .
          </DialogDescription>
          {OrderTicketFields}
        </DialogContent>
      </Dialog>

      <TerminalDialogs
        purchasePopup={purchasePopup}
        setPurchasePopup={setPurchasePopup}
        authenticated={authenticated}
        confirm={confirm}
        setConfirm={setConfirm}
        side={side}
        activeAccount={activeAccount}
        sym={effectiveTicketSym}
        activeQuote={effectiveTicketQuote}
        qty={qty}
        price={execEstPrice}
        estValue={estValue}
        note={note}
        submitting={submitting}
        handleSubmitOrder={handleSubmitOrder}
        noteEditor={noteEditor}
        setNoteEditor={setNoteEditor}
        saveEditedNote={saveEditedNote}
        guideOpen={guideOpen}
        setGuideOpen={setGuideOpen}
        guideStep={guideStep}
        setGuideStep={setGuideStep}
        feedbackOpen={feedbackOpen}
        setFeedbackOpen={setFeedbackOpen}
        feedbackForm={feedbackForm}
        setFeedbackForm={setFeedbackForm}
        sendingFeedback={sendingFeedback}
        submitFeedback={submitFeedback}
      />
    </div>
  );
}

function TerminalDialogs({
  purchasePopup,
  setPurchasePopup,
  authenticated,
  confirm,
  setConfirm,
  side,
  activeAccount,
  sym,
  activeQuote,
  qty,
  price,
  estValue,
  note,
  submitting,
  handleSubmitOrder,
  noteEditor,
  setNoteEditor,
  saveEditedNote,
  guideOpen,
  setGuideOpen,
  guideStep,
  setGuideStep,
  feedbackOpen,
  setFeedbackOpen,
  feedbackForm,
  setFeedbackForm,
  sendingFeedback,
  submitFeedback,
}) {
  const stepData = GUIDE_STEPS[guideStep] || GUIDE_STEPS[0];
  return (
    <>
      {/* Purchase a plan first guard dialog */}
      <Dialog open={purchasePopup} onOpenChange={setPurchasePopup}>
        <DialogContent
          className="max-w-sm bg-[var(--bg-2)] border-[var(--border)] text-[var(--text)]"
          data-testid="purchase-first-dialog"
        >
          <div className="w-11 h-11 rounded-2xl bg-[var(--accent-soft)] text-[var(--emerald)] grid place-items-center mb-2">
            <Lock size={20} />
          </div>
          <DialogTitle className="font-display text-2xl">
            Purchase a plan first
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--muted)]">
            {!authenticated
              ? "Sign in and purchase a challenge plan to unlock symbol search, simulated trading capital, and order execution."
              : "Your trading capital is currently ₹0. Purchase an active challenge or funded account to unlock symbol search and place BUY or SELL orders."}
          </DialogDescription>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <button
              type="button"
              className="flex-1 rounded-xl py-2.5 px-4 border border-[var(--border-hi)] text-sm"
              onClick={() => setPurchasePopup(false)}
            >
              Close
            </button>
            <Link
              to="/challenges"
              onClick={() => setPurchasePopup(false)}
              className="flex-1 btn-amber rounded-xl py-2.5 px-4 text-sm font-semibold text-center inline-flex items-center justify-center gap-1.5"
              data-testid="purchase-first-cta"
            >
              Buy a plan <ArrowRight size={14} />
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Confirmation */}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="max-w-sm bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)]">
          <DialogTitle>Confirm {side.toLowerCase()} order</DialogTitle>
          <DialogDescription className="text-xs text-[var(--muted)]">
            Executes order on account{" "}
            {activeAccount?.account_number || activeAccount?.id || "wallet"}.
            The final price comes from the provider and may differ from this
            estimate.
            {marketStatus === "LIVE" &&
              activeQuote?.tickLive &&
              " The displayed estimate is simulated while waiting for a quote."}
          </DialogDescription>
          <div className="order-summary tabular-nums">
            <div>
              <span>Instrument</span>
              <strong>
                {sym} ({activeQuote?.exchange || "NSE"})
              </strong>
            </div>
            <div>
              <span>Quantity</span>
              <strong>{qty}</strong>
            </div>
            <div>
              <span>Estimated price</span>
              <strong>{formatPrice(price)}</strong>
            </div>
            <div>
              <span>Order value</span>
              <strong>{inr(estValue)}</strong>
            </div>
            {note.trim() && (
              <div>
                <span>Trade note</span>
                <strong className="text-right max-w-[190px] truncate text-[var(--emerald)]">
                  {note.trim()}
                </strong>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="flex-1 rounded-xl py-2.5 border border-[var(--border-hi)] text-sm"
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              className={`flex-1 rounded-xl py-2.5 font-semibold text-sm disabled:opacity-50 ${
                side === "BUY" ? "btn-buy" : "btn-sell"
              }`}
              onClick={handleSubmitOrder}
              data-testid="terminal-confirm-btn"
            >
              {submitting ? "Placing…" : "Place order"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inline Note Editor */}
      <Dialog
        open={!!noteEditor}
        onOpenChange={(v) => !v && setNoteEditor(null)}
      >
        <DialogContent className="max-w-sm bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)]">
          <DialogTitle>Edit Trade Note</DialogTitle>
          <DialogDescription className="text-xs text-[var(--muted)]">
            Record setup notes or review comments for {noteEditor?.id}.
          </DialogDescription>
          <form onSubmit={saveEditedNote} className="space-y-4">
            <textarea
              rows={3}
              maxLength={400}
              className="input-dark text-sm"
              placeholder="Write trade reasoning or journal note…"
              value={noteEditor?.note || ""}
              onChange={(e) =>
                setNoteEditor((prev) =>
                  prev ? { ...prev, note: e.target.value } : prev,
                )
              }
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl py-2 border border-[var(--border-hi)] text-sm"
                onClick={() => setNoteEditor(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 btn-amber rounded-xl py-2 text-sm"
              >
                Save note
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 8-Step Terminal Quick Guide */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-md bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)]">
          <div className="flex items-center justify-between pr-6">
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--emerald)]">
              IndiFunded Web Guide · Step {guideStep + 1} of{" "}
              {GUIDE_STEPS.length}
            </span>
          </div>
          <DialogTitle className="font-display text-xl mt-1">
            {stepData.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--muted)] leading-relaxed">
            {stepData.body}
          </DialogDescription>
          <div className="flex gap-1 pt-2">
            {GUIDE_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setGuideStep(idx)}
                className={`h-1.5 flex-1 rounded-full transition ${
                  idx === guideStep
                    ? "bg-[var(--emerald)]"
                    : idx < guideStep
                      ? "bg-[var(--accent)]/60"
                      : "bg-[var(--border-hi)]"
                }`}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              disabled={guideStep === 0}
              onClick={() => setGuideStep((s) => Math.max(0, s - 1))}
              className="btn-ghost rounded-xl px-4 py-2 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            {guideStep < GUIDE_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setGuideStep((s) => s + 1)}
                className="btn-amber rounded-xl px-5 py-2 text-xs font-semibold"
              >
                Next step
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="btn-amber rounded-xl px-5 py-2 text-xs font-semibold"
              >
                Finish tour
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Feedback Modal */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-sm bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)]">
          <DialogTitle className="font-display text-lg">
            Send terminal feedback
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--muted)]">
            Report an execution issue or request a feature directly to the
            IndiFunded team.
          </DialogDescription>
          <form onSubmit={submitFeedback} className="space-y-3 mt-1">
            <input
              type="text"
              placeholder="Subject (min 4 chars)"
              className="input-dark text-xs"
              value={feedbackForm.subject}
              onChange={(e) =>
                setFeedbackForm((f) => ({ ...f, subject: e.target.value }))
              }
            />
            <textarea
              rows={4}
              placeholder="Share details…"
              className="input-dark text-xs"
              value={feedbackForm.message}
              onChange={(e) =>
                setFeedbackForm((f) => ({ ...f, message: e.target.value }))
              }
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFeedbackOpen(false)}
                className="flex-1 btn-ghost rounded-xl py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendingFeedback}
                className="flex-1 btn-amber rounded-xl py-2 text-xs font-semibold disabled:opacity-60"
              >
                {sendingFeedback ? "Sending…" : "Submit"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
