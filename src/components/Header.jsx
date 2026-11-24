import { Link, NavLink, useLocation } from "@/lib/router-compat";
import { Menu, X, User, LayoutDashboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import BrandLogo from "./BrandLogo";
import { Button } from "./ui/button";

const baseLinks = [
  { to: "/", label: "Home" },
  { to: "/challenges", label: "Challenges" },
  { to: "/rules", label: "Rules" },
  { to: "/payouts", label: "Payouts" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/league", label: "Trader League", flag: "league" },
  { to: "/blog", label: "Blog" },
  { to: "/refer", label: "Refer & Earn" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
];

export const Header = () => {
  const [open, setOpen] = useState(false);
  const [leagueEnabled, setLeagueEnabled] = useState(false);
  const { settings, syncVersion } = useSettings();
  const { user } = useAuth();
  const loc = useLocation();
  const headerRef = useRef(null);

  useEffect(() => {
    setOpen(false);
  }, [loc.pathname, loc.search]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onPointerDown = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    let alive = true;
    api
      .get("/league/config")
      .then((r) => {
        if (alive) setLeagueEnabled(!!r.data?.enabled);
      })
      .catch(() => {
        if (alive) setLeagueEnabled(false);
      });
    return () => {
      alive = false;
    };
  }, [syncVersion]);
  const links = baseLinks.filter((l) => l.flag !== "league" || leagueEnabled);
  const dashHref = user ? (user.role === "admin" ? "/admin" : "/app") : null;
  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 glass border-b border-[var(--border)]"
      data-testid="site-header"
    >
      <div className="container-xl flex items-center justify-between py-2.5 md:py-4">
        <Link to="/" className="flex items-center shared-brand-el" data-testid="logo-link">
          <BrandLogo size="md" />
        </Link>
        <nav className="hidden xl:flex items-center gap-4">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `link-underline text-sm ${isActive ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-white"}`
              }
              data-testid={`nav-${l.label.toLowerCase()}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden xl:flex items-center gap-3">
          {user ? (
            <Link
              to={dashHref}
              className="btn-ghost px-4 py-2.5 rounded-full text-sm inline-flex items-center gap-2"
              data-testid="header-dashboard"
            >
              <LayoutDashboard size={14} /> Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="btn-ghost px-4 py-2.5 rounded-full text-sm inline-flex items-center gap-2"
              data-testid="header-signin"
            >
              <User size={14} /> Sign in
            </Link>
          )}
          <Link
            to={user ? "/challenges" : "/login?next=/challenges"}
            className="btn-amber px-5 py-2.5 rounded-full text-sm tx-morph shared-cta-el"
            data-testid="header-cta-start"
          >
            {settings.hero?.cta_primary || "Start Challenge"}
          </Link>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="xl:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          data-testid="mobile-menu-toggle"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </Button>
      </div>
      {open && (
        <div className="xl:hidden border-t border-[var(--border)] glass tx-slide-y">
          <div className="container-xl py-3 flex flex-col gap-2">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="py-2 text-[var(--muted)]"
                data-testid={`mnav-${l.label.toLowerCase()}`}
              >
                {l.label}
              </Link>
            ))}
            {user ? (
              <Link
                to={dashHref}
                onClick={() => setOpen(false)}
                className="btn-ghost px-5 py-2.5 rounded-full text-sm text-center mt-2 inline-flex items-center justify-center gap-2"
              >
                <LayoutDashboard size={14} /> Dashboard
              </Link>
            ) : (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="btn-ghost px-5 py-2.5 rounded-full text-sm text-center mt-2 inline-flex items-center justify-center gap-2"
              >
                <User size={14} /> Sign in
              </Link>
            )}
            <Link
              to="/challenges"
              onClick={() => setOpen(false)}
              className="btn-amber px-5 py-2.5 rounded-full text-sm text-center mt-2"
              data-testid="mobile-cta-start"
            >
              {settings.hero?.cta_primary || "Start Challenge"}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
