import { NavLink, Navigate, Outlet, useNavigate, Link, useLocation } from "@/lib/router-compat";
import Showcase3D from "../../components/Showcase3D";
import { getRouteTransitionClass } from "../../components/MotionSystem";
import { useAuth } from "../../context/AuthContext";
import {
  LayoutDashboard,
  Package,
  FileText,
  Users,
  ShoppingBag,
  LogOut,
  Award,
  Wallet,
  Settings,
  Trophy,
  Tag,
  Gift,
  Menu,
  X,
  Sparkles,
  MessageSquare,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import BrandLogo from "../../components/BrandLogo";

const links = [
  { to: "/admin", label: "Dashboard", icon: <LayoutDashboard size={16} />, end: true },
  { to: "/admin/ai-editor", label: "AI Site Studio", icon: <Sparkles size={16} /> },
  { to: "/admin/settings", label: "Site Settings", icon: <Settings size={16} /> },
  { to: "/admin/email", label: "Business Gmail", icon: <Mail size={16} /> },
  { to: "/admin/plans", label: "Plans", icon: <Package size={16} /> },
  { to: "/admin/funding-products", label: "Funding Products", icon: <ShieldCheck size={16} /> },
  { to: "/admin/blogs", label: "Blogs", icon: <FileText size={16} /> },
  { to: "/admin/certificates", label: "Certificates", icon: <Award size={16} /> },
  { to: "/admin/weekly-payouts", label: "Weekly Highest", icon: <Trophy size={16} /> },
  { to: "/admin/leaderboard", label: "Leaderboard", icon: <Trophy size={16} /> },
  { to: "/admin/coupons", label: "Coupons", icon: <Tag size={16} /> },
  { to: "/admin/referrals", label: "Referrals", icon: <Gift size={16} /> },
  { to: "/admin/payouts", label: "Payouts", icon: <Wallet size={16} /> },
  { to: "/admin/leads", label: "Leads", icon: <Users size={16} /> },
  { to: "/admin/tickets", label: "Support Tickets", icon: <MessageSquare size={16} /> },
  { to: "/admin/stories", label: "Trader Stories", icon: <Award size={16} /> },
  { to: "/admin/orders", label: "Orders", icon: <ShoppingBag size={16} /> },
  { to: "/admin/league", label: "Trader League", icon: <Trophy size={16} /> },
  { to: "/admin/users", label: "Users", icon: <Users size={16} /> },
];

export default function AdminLayout() {
  const loc3d = useLocation();
  const { user, loading, signingOut, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [loc3d.pathname, loc3d.search]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (loading) {
    return (
      <div
        className="min-h-screen grid grid-cols-1 md:grid-cols-[240px_1fr] bg-[var(--bg)]"
        aria-busy="true"
      >
        <span className="sr-only">Loading…</span>
        <aside className="hidden md:block border-r border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-3">
          <div className="h-8 w-36 rounded-lg bg-[var(--surface)] animate-pulse mb-6" />
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-[var(--surface)]/70 animate-pulse" />
          ))}
        </aside>
        <main className="p-6 md:p-10 max-w-6xl w-full space-y-6">
          <div className="h-10 w-52 rounded-xl bg-[var(--surface)] animate-pulse" />
          <div className="grid md:grid-cols-4 gap-4">
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
    if ((loc3d.pathname || "").startsWith("/login")) {
      return null;
    }
    const nextUrl = `${loc3d.pathname || "/admin"}${loc3d.search || ""}`;
    return <Navigate to={`/login?next=${encodeURIComponent(nextUrl)}`} replace />;
  }
  if (user.role !== "admin") return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[240px_1fr] grain">
      {/* Mobile topbar */}
      <div className="md:hidden flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-1)] p-4 sticky top-0 z-40">
        <Link to="/" className="flex items-center gap-2">
          <BrandLogo size="sm" />
          <div className="text-xs text-[var(--muted-2)] font-mono uppercase tracking-wider ml-1">
            Admin
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-ghost px-3 py-2 rounded-lg"
          data-testid="admin-mobile-toggle"
          aria-label={open ? "Close admin menu" : "Open admin menu"}
          aria-expanded={open}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`${
          open ? "fixed inset-y-0 left-0 z-50 w-[260px] max-w-[82vw] block shadow-2xl" : "hidden"
        } md:block md:static md:w-auto border-r border-[var(--border)] bg-[var(--bg-1)] p-5 md:sticky md:top-0 md:h-screen overflow-y-auto`}
      >
        <div className="flex items-center justify-between mb-4 md:hidden">
          <Link to="/" onClick={() => setOpen(false)} className="flex items-center gap-2">
            <BrandLogo size="sm" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-white"
            aria-label="Close admin sidebar"
          >
            <X size={16} />
          </button>
        </div>
        <Link to="/" className="hidden md:flex items-center gap-2">
          <BrandLogo size="md" />
          <div className="text-[10px] text-[var(--muted-2)] font-mono uppercase tracking-wider ml-1">
            Admin
          </div>
        </Link>
        <nav className="md:mt-10 flex flex-col gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${isActive ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-white"}`
              }
              data-testid={`admin-nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {l.icon}
              {l.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={async () => {
            setOpen(false);
            try {
              await logout();
            } finally {
              nav("/login", { replace: true });
            }
          }}
          className="mt-6 md:mt-10 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--muted)] hover:text-white hover:bg-[var(--surface)] w-full"
          data-testid="admin-logout"
        >
          <LogOut size={16} /> Logout
        </button>
        <div className="mt-6 md:mt-10 text-xs text-[var(--muted-2)] font-mono truncate">
          {user.email}
        </div>
      </aside>
      <main className="p-5 md:p-8 lg:p-12 max-w-6xl w-full min-w-0 has-showcase has-showcase--panel">
        <Showcase3D path={loc3d.pathname} />
        <div
          key={loc3d.pathname}
          className={`showcase-content ${getRouteTransitionClass(loc3d.pathname)}`}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
