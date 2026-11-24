// Which unique 3D scene each page gets. null = no 3D on that page.
export function sceneForPath(path = "/") {
  const p = String(path || "/").replace(/\/+$/, "") || "/";
  if (p === "/") return null; // home places its own scene beside the plans
  if (p.startsWith("/admin")) return p === "/admin" ? "admin" : null; // data-heavy admin screens stay clean
  if (p.startsWith("/app")) return p === "/app" ? "dashboard" : null; // tables/terminal stay clean
  if (p.startsWith("/challenges") || p.startsWith("/how-it-works"))
    return "challenges";
  if (
    p.startsWith("/payouts") ||
    p.startsWith("/payout-request") ||
    p.startsWith("/refer")
  )
    return "payouts";
  if (
    p.startsWith("/our-traders") ||
    p.startsWith("/stories") ||
    p.startsWith("/leaderboard") ||
    p.startsWith("/league")
  )
    return "traders";
  if (p.startsWith("/trust") || p.startsWith("/verify")) return "trust";
  if (
    p.startsWith("/login") ||
    p.startsWith("/forgot-password") ||
    p.startsWith("/reset-password") ||
    p.startsWith("/checkout")
  )
    return null;
  return "default";
}
