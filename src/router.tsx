import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: () => false,
    defaultPreload: "intent",
    defaultPreloadDelay: 15,
    defaultPreloadStaleTime: 30_000,
    defaultPendingMs: 0,
  });

  if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
    window.history.scrollRestoration = "auto";
  }

  return router;
};
