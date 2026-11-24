import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("removes the standalone /virtual-trading and /platform routes", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });
    const routeIds = Object.keys(router.routesById);

    expect(routeIds).not.toContain("/_site/virtual-trading");
    expect(routeIds).not.toContain("/_site/platform");
    expect(routeIds).toContain("/app/terminal");
  });

  it("matches routes for /admin/tickets and /contact", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });

    const adminTicketMatches = router.matchRoutes("/admin/tickets");
    const contactMatches = router.matchRoutes("/contact");

    expect(adminTicketMatches.at(-1)?.routeId).toBe("/admin/tickets");
    expect(contactMatches.at(-1)?.routeId).toBe("/_site/contact");
  });

  it("removes the /tools route", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });
    const routeIds = Object.keys(router.routesById);

    expect(routeIds).not.toContain("/_site/tools");
    expect(routeIds).not.toContain("/tools");
  });
});
