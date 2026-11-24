import { NavLink, Navigate, Outlet, useNavigate, Link, useLocation } from "@/lib/router-compat";
import Showcase3D from "../../components/Showcase3D";
import { getRouteTransitionClass } from "../../components/MotionSystem";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { api, formatINR, formatApiError } from "../../lib/api";
import {
  LayoutDashboard,
  Wallet,
  Award,
  Settings as SettingsIcon,
  Briefcase,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  CandlestickChart,
  Bell,
  Users,
  Receipt,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Plus,
  MessageSquare,
  Send,
  ExternalLink,
  Check,
  BookOpen,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import BrandLogo from "../../components/BrandLogo";

const SIDEBAR_GROUPS = [
  {
    group: "TRADING",
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, id: "dashboard" },
      { to: "/app/accounts", label: "Accounts", icon: Briefcase, id: "accounts" },
      { to: "/app/journal", label: "Trading Journal", icon: BookOpen, id: "journal" },
    ],
  },
  {
    group: "PAYOUTS",
    items: [
      { to: "/app/payouts", label: "Payouts", icon: Wallet, id: "payouts" },
      { to: "/app/certificates", label: "Certificates", icon: Award, id: "certificates" },
    ],
  },
  {
    group: "PARTNER",
    items: [{ to: "/app/refer", label: "Refer a friend", icon: Users, id: "refer" }],
  },
  {
    group: "ACCOUNT",
    items: [
      { to: "/app/invoices", label: "Invoices", icon: Receipt, id: "invoices" },
      { to: "/app/settings", label: "Settings", icon: SettingsIcon, id: "settings" },
    ],
  },
];

export default function UserDashboardLayout() {
  const loc = useLocation();
  const { user, loading, signingOut, logout } = useAuth();
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const nav = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [acctMenuOpen, setAcctMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const [dashSummary, setDashSummary] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [chatForm, setChatForm] = useState({ subject: "", message: "", category: "Account" });
  const [sendingChat, setSendingChat] = useState(false);

  const acctMenuRef = useRef(null);
  const notifMenuRef = useRef(null);
  const userMenuRef = useRef(null);

  const isTerminalRoute = (loc.pathname || "").replace(/\/+$/, "") === "/app/terminal";

  useEffect(() => {
    setMobileOpen(false);
    setAcctMenuOpen(false);
    setNotifOpen(false);
    setUserMenuOpen(false);
    setChatOpen(false);
  }, [loc.pathname, loc.search]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-if-theme", resolvedTheme);
    return () => {
      document.documentElement.removeAttribute("data-if-theme");
    };
  }, [resolvedTheme]);

  const loadHeaderData = useCallback(() => {
    if (!user || user.role === "admin" || isTerminalRoute) return;
    api
      .get("/me/dashboard")
      .then((r) => setDashSummary(r.data))
      .catch(() => {});
    api
      .get("/me/notifications")
      .then((r) => setNotifs(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [user, isTerminalRoute]);

  useEffect(() => {
    loadHeaderData();
  }, [loadHeaderData]);

  useEffect(() => {
    if (!chatOpen || !user) return;
    api
      .get("/me/tickets")
      .then((r) => setTickets(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [chatOpen, user]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onDocPointerDown = (e) => {
      if (acctMenuRef.current && !acctMenuRef.current.contains(e.target)) setAcctMenuOpen(false);
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target)) setNotifOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setAcctMenuOpen(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
        setChatOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (loading) {
    return (
      <div
        className="dash-shell min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col md:flex-row"
        aria-busy="true"
      >
        <span className="sr-only">Loading trader workspace…</span>
        <aside className="hidden md:flex md:flex-col w-[240px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-4">
          <div className="h-8 w-32 rounded-lg bg-[var(--surface)] animate-pulse" />
          <div className="space-y-2 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-9 rounded-xl bg-[var(--surface)]/70 animate-pulse" />
            ))}
          </div>
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 border-b border-[var(--border)] bg-[var(--bg-1)] px-6 flex items-center justify-between">
            <div className="h-7 w-40 rounded-xl bg-[var(--surface)] animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-[var(--surface)] animate-pulse" />
              <div className="h-8 w-28 rounded-xl bg-[var(--surface)] animate-pulse" />
            </div>
          </header>
          <main className="p-6 md:p-8 max-w-6xl w-full mx-auto space-y-6">
            <div className="h-9 w-56 rounded-xl bg-[var(--surface)] animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl border border-[var(--border)] bg-[var(--bg-1)] animate-pulse"
                />
              ))}
            </div>
            <div className="h-64 rounded-2xl border border-[var(--border)] bg-[var(--bg-1)] animate-pulse" />
          </main>
        </div>
      </div>
    );
  }
  if (!user) {
    if (signingOut) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--muted)] text-sm font-mono">
          Signing out…
        </div>
      );
    }
    if ((loc.pathname || "").startsWith("/login")) {
      return null;
    }
    const nextUrl = `${loc.pathname || "/app"}${loc.search || ""}`;
    return <Navigate to={`/login?next=${encodeURIComponent(nextUrl)}`} replace />;
  }
  if (user.role === "admin") return <Navigate to="/admin" replace />;

  // Full-bleed Web Trading Terminal for /app/terminal
  if (isTerminalRoute) {
    return (
      <div className="dash-shell min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <Outlet />
      </div>
    );
  }

  const initials = (user.name || user.email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const accounts = dashSummary?.accounts || [];
  const totalEquity = dashSummary?.simulated_capital ?? 0;
  const unreadNotifs = notifs.filter((n) => !n.read).length;

  const markAllNotifsRead = async () => {
    try {
      await api.post("/me/notifications/read", {});
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (chatForm.subject.trim().length < 4 || chatForm.message.trim().length < 10) {
      toast.error("Please add a subject (min 4 chars) and message (min 10 chars).");
      return;
    }
    setSendingChat(true);
    try {
      const { data } = await api.post("/me/tickets", chatForm);
      setTickets((prev) => [data, ...prev]);
      setChatForm({ subject: "", message: "", category: "Account" });
      toast.success(`Message sent (${data.id})`);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Could not send message"));
    } finally {
      setSendingChat(false);
    }
  };

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4 border-b border-[var(--border)]">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <BrandLogo size="md" />
        </Link>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)] mt-1.5 pl-0.5">
          Trader Portal
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto custom-scrollbar space-y-5">
        {SIDEBAR_GROUPS.map((grp) => (
          <div key={grp.group}>
            <div className="px-3 mb-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
              {grp.group}
            </div>
            <div className="space-y-0.5">
              {grp.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpen(false)}
                    data-testid={`dash-nav-${item.id}`}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                        isActive
                          ? "bg-[var(--accent)] text-white shadow-sm"
                          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                      }`
                    }
                  >
                    <Icon size={15} className="shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3.5 border-t border-[var(--border)] space-y-2.5">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[11px] font-medium text-[var(--muted)]">Theme</span>
          <div className="seg !p-0.5" role="group" aria-label="Theme mode">
            {[
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["system", "System", Monitor],
            ].map(([id, lbl, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                title={lbl}
                aria-label={`${lbl} theme`}
                className={`!px-2 !py-1 inline-flex items-center justify-center ${
                  theme === id ? "is-on" : ""
                }`}
              >
                <Icon size={12} />
              </button>
            ))}
          </div>
        </div>
        <Link
          to="/challenges"
          onClick={() => setMobileOpen(false)}
          className="btn-amber rounded-xl px-4 py-2.5 text-xs font-semibold w-full inline-flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Buy new account
        </Link>
        <div className="flex items-center justify-between px-1 text-[11px] text-[var(--muted-2)]">
          <Link to="/rules" className="hover:text-[var(--text)] transition-colors">
            Trading rules
          </Link>
          <span className="inline-flex items-center gap-1 font-mono text-[10px]">
            <ShieldCheck size={11} className="text-[var(--emerald)]" /> Sim env
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            setMobileOpen(false);
            try {
              await logout();
            } finally {
              nav("/login", { replace: true });
            }
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] w-full transition-colors"
          data-testid="dash-signout"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="dash-shell min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col md:flex-row">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex md:flex-col w-[240px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-1)] md:sticky md:top-0 md:h-screen z-30">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-[260px] max-w-[82vw] bg-[var(--bg-1)] border-r border-[var(--border)] h-full z-10 flex flex-col">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)]"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky Top Bar */}
        <header className="sticky top-0 z-30 h-14 border-b border-[var(--border)] bg-[var(--bg-1)]/95 backdrop-blur px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setMobileOpen((v) => !v);
                setAcctMenuOpen(false);
                setNotifOpen(false);
                setUserMenuOpen(false);
              }}
              className="md:hidden p-2 rounded-lg border border-[var(--border-hi)] text-[var(--text)] shrink-0"
              data-testid="dash-mobile-toggle"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>

            {/* Account Switcher Dropdown */}
            <div className="relative min-w-0" ref={acctMenuRef}>
              <button
                type="button"
                aria-expanded={acctMenuOpen}
                onClick={() => {
                  setAcctMenuOpen((v) => !v);
                  setNotifOpen(false);
                  setUserMenuOpen(false);
                  setMobileOpen(false);
                }}
                className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-[var(--border-hi)] bg-[var(--surface)] hover:border-[var(--accent)] text-xs transition-colors tabular-nums max-w-full"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--emerald)] shrink-0" />
                <div className="text-left leading-tight min-w-0">
                  <div className="font-medium text-[var(--text)] truncate max-w-[110px] sm:max-w-none">
                    All accounts
                  </div>
                  <div className="sm:hidden font-mono text-[9px] text-[var(--muted-2)] truncate">
                    {accounts.length} total · {formatINR(totalEquity)}
                  </div>
                </div>
                <span className="hidden sm:inline font-mono text-[11px] text-[var(--muted)]">
                  {formatINR(totalEquity)} · {accounts.length}
                </span>
                <ChevronDown size={13} className="text-[var(--muted)] shrink-0" />
              </button>

              {acctMenuOpen && (
                <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-[var(--border-hi)] bg-[var(--bg-1)] shadow-2xl p-2 z-50">
                  <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)] flex items-center justify-between">
                    <span>Your trading accounts</span>
                    <span>{accounts.length} total</span>
                  </div>
                  {accounts.length ? (
                    <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                      {accounts.map((a) => (
                        <Link
                          key={a.id}
                          to={`/app/accounts?account=${encodeURIComponent(a.id)}`}
                          onClick={() => setAcctMenuOpen(false)}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl hover:bg-[var(--bg-2)] transition-colors tabular-nums"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[var(--text)] truncate">
                              {a.plan_name || "Evaluation"}
                            </div>
                            <div className="text-[10px] font-mono text-[var(--muted-2)] truncate">
                              {a.account_number || a.id} · {a.status || "Active"}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-mono font-semibold text-[var(--text)]">
                              {formatINR(a.balance ?? a.starting_capital ?? 0)}
                            </div>
                            <div
                              className={`text-[10px] font-mono ${
                                Number(a.realized_pnl || 0) >= 0
                                  ? "text-[var(--emerald)]"
                                  : "text-[var(--rose)]"
                              }`}
                            >
                              {Number(a.realized_pnl || 0) >= 0 ? "+" : "−"}
                              {formatINR(Math.abs(Number(a.realized_pnl || 0)))}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-xs text-[var(--muted)] text-center">
                      No active accounts yet.
                    </div>
                  )}
                  <div className="border-t border-[var(--border)] mt-1.5 pt-1.5 flex flex-col gap-1">
                    <Link
                      to="/app/accounts"
                      onClick={() => setAcctMenuOpen(false)}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-2)] flex items-center justify-between"
                    >
                      <span>View all accounts</span>
                      <ExternalLink size={11} />
                    </Link>
                    <Link
                      to="/challenges"
                      onClick={() => setAcctMenuOpen(false)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--emerald)] hover:bg-[var(--accent-soft)] flex items-center gap-1.5"
                    >
                      <Plus size={12} /> Buy new account
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted-2)] px-2.5 py-1 rounded-lg bg-[var(--bg-2)] border border-[var(--border)]">
              <ShieldCheck size={12} className="text-[var(--emerald)]" /> Simulated trading
              environment
            </span>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
              aria-label="Toggle theme"
              className="w-9 h-9 rounded-xl border border-[var(--border-hi)] bg-[var(--surface)] hover:border-[var(--accent)] grid place-items-center text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              {resolvedTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <div className="relative" ref={notifMenuRef}>
              <button
                type="button"
                aria-expanded={notifOpen}
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setAcctMenuOpen(false);
                  setUserMenuOpen(false);
                  setMobileOpen(false);
                }}
                aria-label="Notifications"
                className="relative w-9 h-9 rounded-xl border border-[var(--border-hi)] bg-[var(--surface)] hover:border-[var(--accent)] grid place-items-center text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                <Bell size={15} />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-mono grid place-items-center">
                    {unreadNotifs}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-[var(--border-hi)] bg-[var(--bg-1)] shadow-2xl p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                    <span className="text-xs font-semibold text-[var(--text)]">Notifications</span>
                    {unreadNotifs > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotifsRead}
                        className="text-[11px] text-[var(--emerald)] hover:underline inline-flex items-center gap-1"
                      >
                        <Check size={11} /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border)] custom-scrollbar">
                    {notifs.length ? (
                      notifs.slice(0, 5).map((n) => (
                        <div key={n.id} className="py-2.5 text-xs">
                          <div className="font-medium text-[var(--text)]">{n.title || n.t}</div>
                          <div className="text-[var(--muted)] text-[11px] mt-0.5 line-clamp-2">
                            {n.body || n.d}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-center text-xs text-[var(--muted)]">
                        You&apos;re all caught up.
                      </div>
                    )}
                  </div>
                  <Link
                    to="/app/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="block text-center text-xs text-[var(--emerald)] pt-2 border-t border-[var(--border)] hover:underline"
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </div>

            <Link
              to="/app/terminal"
              title="Open IndiFunded Web Terminal"
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[var(--border-hi)] bg-[var(--surface)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text)] transition-colors"
            >
              <CandlestickChart size={15} className="text-[var(--emerald)]" />
              <span className="hidden lg:inline">Terminal</span>
            </Link>

            {/* User Profile Pill + Popover */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                aria-expanded={userMenuOpen}
                onClick={() => {
                  setUserMenuOpen((v) => !v);
                  setAcctMenuOpen(false);
                  setNotifOpen(false);
                  setMobileOpen(false);
                }}
                className="inline-flex items-center gap-2.5 pl-2 pr-2.5 py-1 rounded-xl border border-[var(--border-hi)] bg-[var(--surface)] hover:border-[var(--accent)] transition-colors"
              >
                <div className="hidden sm:block text-right leading-tight">
                  <div className="text-xs font-medium text-[var(--text)] max-w-[120px] truncate">
                    {user.name || "Trader"}
                  </div>
                  <div className="text-[10px] font-mono text-[var(--muted-2)] max-w-[120px] truncate">
                    {user.email}
                  </div>
                </div>
                <div
                  className="w-8 h-8 rounded-full bg-[var(--accent)] text-white grid place-items-center font-semibold text-xs shrink-0"
                  data-testid="dash-user-initials"
                >
                  {initials}
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-[var(--border-hi)] bg-[var(--bg-1)] shadow-2xl p-2 z-50">
                  <div className="px-2.5 py-2 border-b border-[var(--border)] mb-1">
                    <div className="text-xs font-semibold text-[var(--text)] truncate">
                      {user.name || "Trader"}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--muted-2)] truncate">
                      {user.email}
                    </div>
                  </div>
                  <Link
                    to="/app/terminal"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-[var(--text)] hover:bg-[var(--bg-2)]"
                  >
                    <CandlestickChart size={14} className="text-[var(--emerald)]" /> Launch Web
                    Terminal
                  </Link>
                  <Link
                    to="/app/journal"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-[var(--text)] hover:bg-[var(--bg-2)]"
                  >
                    <BookOpen size={14} className="text-[var(--accent)]" /> Trading Journal
                  </Link>
                  <Link
                    to="/app/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-[var(--text)] hover:bg-[var(--bg-2)]"
                  >
                    <SettingsIcon size={14} className="text-[var(--muted)]" /> Settings &amp;
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      setUserMenuOpen(false);
                      try {
                        await logout();
                      } finally {
                        nav("/login", { replace: true });
                      }
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-[var(--rose)] hover:bg-[var(--rose)]/10 mt-1"
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Main Content */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-6xl w-full mx-auto min-w-0 has-showcase has-showcase--panel">
          <Showcase3D path={loc.pathname} />
          <div
            key={loc.pathname}
            className={`showcase-content ${getRouteTransitionClass(loc.pathname)}`}
          >
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating Chat with us Widget */}
      <div className="fixed bottom-5 right-5 z-40">
        {chatOpen ? (
          <div className="w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border-hi)] bg-[var(--bg-1)] shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-[var(--accent)] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={15} />
                <div>
                  <div className="text-xs font-semibold">IndiFunded Trader Desk</div>
                  <div className="text-[10px] opacity-85">Direct support ticket</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="p-1 rounded-lg hover:bg-white/15"
                aria-label="Close support chat"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-3.5 space-y-3 max-h-[380px] overflow-y-auto custom-scrollbar">
              {tickets.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                    Recent tickets
                  </div>
                  {tickets.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[var(--text)] truncate">{t.subject}</span>
                        <span className="text-[10px] font-mono text-[var(--emerald)] shrink-0">
                          {t.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--muted)] mt-1 line-clamp-2">
                        {t.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleChatSubmit} className="space-y-2.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                  Send a message
                </div>
                <select
                  className="input-dark !py-1.5 !text-xs"
                  value={chatForm.category}
                  onChange={(e) => setChatForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {["Account", "Trading", "Payouts", "KYC", "Other"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Subject (min 4 chars)"
                  className="input-dark !py-1.5 !text-xs"
                  value={chatForm.subject}
                  onChange={(e) => setChatForm((f) => ({ ...f, subject: e.target.value }))}
                />
                <textarea
                  rows={3}
                  placeholder="How can our desk help you today?"
                  className="input-dark !min-h-[70px] !py-1.5 !text-xs"
                  value={chatForm.message}
                  onChange={(e) => setChatForm((f) => ({ ...f, message: e.target.value }))}
                />
                <div className="flex items-center justify-between gap-2">
                  <Link
                    to="/app/support"
                    onClick={() => setChatOpen(false)}
                    className="text-[11px] text-[var(--muted)] hover:text-[var(--text)] underline"
                  >
                    All tickets
                  </Link>
                  <button
                    type="submit"
                    disabled={sendingChat}
                    className="btn-amber rounded-xl px-3.5 py-2 text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Send size={12} /> {sendingChat ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="btn-amber rounded-full px-4 py-2.5 text-xs font-semibold inline-flex items-center gap-2 shadow-xl"
          >
            <MessageSquare size={14} /> Chat with us
          </button>
        )}
      </div>
    </div>
  );
}
