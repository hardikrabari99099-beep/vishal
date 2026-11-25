import { describe, it, vi } from "vitest";
import fs from "node:fs";
import React, { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { getRouter } from "@/router";
import { api } from "@/lib/api";

describe("Compare live SSR HTML vs real getRouter() client render", () => {
  it("hydrates live server /tmp/ssr_home.html body with getRouter()", async () => {
    const rawHtml = fs.readFileSync("/tmp/ssr_home.html", "utf8");
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/);
    const bodyInner = bodyMatch ? bodyMatch[1] : "";
    const beforeScript = bodyInner
      .slice(0, bodyInner.indexOf("<script data-tsr-stream-part"))
      .replace(/ data-tsd-source="[^"]*"/g, "");

    vi.spyOn(api, "get").mockResolvedValue({ data: {} } as never);
    const router = getRouter();
    router.update({
      routeTree: (() => {
        const tree = router.routeTree;
        (tree as { options: Record<string, unknown> }).options.shellComponent = ({
          children,
        }: {
          children: React.ReactNode;
        }) => <>{children}</>;
        return tree;
      })(),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();

    const container = document.createElement("div");
    container.innerHTML = beforeScript;
    document.body.appendChild(container);

    const errors: string[] = [];
    const errSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map((a) => String(a)).join(" "));
    });
    const recoverable: unknown[] = [];

    let root: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => {
      root = hydrateRoot(container, <RouterProvider router={router} />, {
        onRecoverableError: (e) => recoverable.push(e),
      });
    });

    await act(async () => {
      root?.unmount();
    });
    container.remove();
    errSpy.mockRestore();
    vi.restoreAllMocks();

    const hydErrs = errors.filter((m) => /hydrat|didn't match/i.test(m));
    if (hydErrs.length > 0 || recoverable.length > 0) {
      throw new Error(
        `LIVE HTML MISMATCH (${hydErrs.length} hydErrs, ${recoverable.length} rec):\n${hydErrs.join("\n\n")}\n\n${recoverable.map((e) => String(e)).join("\n\n")}`,
      );
    }
  });
});
