import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultRoutePending() {
  return (
    <div
      className="container-xl py-10 md:py-14 space-y-5 min-h-[50vh]"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="h-6 w-36 rounded-full bg-white/[0.06] animate-pulse" />
      <div className="h-10 w-2/3 max-w-lg rounded-xl bg-white/[0.06] animate-pulse" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
        <div className="h-36 rounded-2xl border border-[var(--border)] bg-white/[0.03] animate-pulse" />
        <div className="h-36 rounded-2xl border border-[var(--border)] bg-white/[0.03] animate-pulse" />
        <div className="h-36 rounded-2xl border border-[var(--border)] bg-white/[0.03] animate-pulse hidden lg:block" />
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: () => false,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 60_000,
    defaultPendingMs: 120,
    defaultPendingMinMs: 0,
    defaultPendingComponent: DefaultRoutePending,
  });

  if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
    window.history.scrollRestoration = "auto";
  }

  return router;
};
