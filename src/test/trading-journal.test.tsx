import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

describe("Trading Journal Routing", () => {
  it("registers /app/journal route under the trader dashboard", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });
    const routeIds = Object.keys(router.routesById);
    expect(routeIds).toContain("/app/journal");
    const matches = router.matchRoutes("/app/journal");
    expect(matches.at(-1)?.routeId).toBe("/app/journal");
  });
});

describe("Trading Journal Backend CRUD & Screenshot Storage", () => {
  let tempDir = "";
  let storeFile = "";

  const resetRuntime = () => {
    delete (globalThis as Record<string, unknown>)["__indifundedRuntimeStore"];
  };

  async function apiCall(
    method: string,
    routePath: string,
    body?: unknown,
    token?: string,
  ) {
    const { handleApi } = await import("@/server/api-handler");
    const clean = routePath.replace(/^\/+/, "");
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers["authorization"] = `Bearer ${token}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const req = new Request(`http://localhost:3000/api/${clean}`, init);
    const res = await handleApi(req, clean.split("?")[0] || "");
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const text = await res.text();
      return {
        status: res.status,
        data: text ? JSON.parse(text) : null,
        contentType,
      };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, data: buf, contentType };
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "indifunded-journal-test-"),
    );
    storeFile = path.join(tempDir, ".indifunded-store.local");
    process.env["INDIFUNDED_STORE_FILE"] = storeFile;
    resetRuntime();
  });

  afterEach(() => {
    delete process.env["INDIFUNDED_STORE_FILE"];
    resetRuntime();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("enforces auth and supports full create, read, update, delete, screenshot storage, and owner isolation", async () => {
    const unauth = await apiCall("GET", "/me/journal");
    expect(unauth.status).toBe(401);

    const signupA = await apiCall("POST", "/auth/signup", {
      name: "Arjun Mehta",
      email: "arjun.journal@example.in",
      password: "Password@123",
      phone: "9876500001",
    });
    expect(signupA.status).toBe(200);
    const loginA = await apiCall("POST", "/auth/local-login", {
      email: "arjun.journal@example.in",
      password: "Password@123",
    });
    expect(loginA.status).toBe(200);
    const tokenA = String(loginA.data.token);

    const signupB = await apiCall("POST", "/auth/signup", {
      name: "Neha Singh",
      email: "neha.journal@example.in",
      password: "Password@123",
      phone: "9876500002",
    });
    expect(signupB.status).toBe(200);
    const loginB = await apiCall("POST", "/auth/local-login", {
      email: "neha.journal@example.in",
      password: "Password@123",
    });
    expect(loginB.status).toBe(200);
    const tokenB = String(loginB.data.token);

    // Upload chart screenshot via dedicated endpoint
    const shotRes = await apiCall(
      "POST",
      "/me/journal/screenshot",
      { data_url: TINY_PNG_DATA_URL, filename: "nifty-orb.png" },
      tokenA,
    );
    expect(shotRes.status).toBe(200);
    expect(String(shotRes.data.url)).toMatch(
      /^\/api\/media\/jrnlimg_[a-zA-Z0-9_-]+\.png$/,
    );

    // Verify screenshot streams from /api/media/:filename
    const mediaFetch = await apiCall(
      "GET",
      shotRes.data.url.replace(/^\/api/, ""),
    );
    expect(mediaFetch.status).toBe(200);
    expect(mediaFetch.contentType).toBe("image/png");
    expect((mediaFetch.data as Uint8Array).length).toBeGreaterThan(20);

    // Reject invalid SVG data URI upload
    const badMime = await apiCall(
      "POST",
      "/me/journal/screenshot",
      {
        data_url: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        filename: "bad.svg",
      },
      tokenA,
    );
    expect(badMime.status).toBe(400);

    // Create journal entry (auto-calculating PnL from entry/exit/qty)
    const created = await apiCall(
      "POST",
      "/me/journal",
      {
        symbol: "nifty 24500 ce",
        side: "BUY",
        trade_date: "2026-11-20",
        timeframe: "5m",
        entry_price: 120,
        exit_price: 155,
        qty: 50,
        setup: "Opening range breakout",
        emotions: "Disciplined",
        rating: 5,
        strategy_tags: ["ORB", "Breakout", "orb"],
        notes: "Clean volume expansion above 5m ORB high.",
        screenshot_url: shotRes.data.url,
      },
      tokenA,
    );
    expect(created.status).toBe(200);
    expect(created.data.symbol).toBe("NIFTY 24500 CE");
    expect(created.data.pnl).toBe(1750);
    expect(created.data.strategy_tags).toEqual(["ORB", "Breakout"]);
    expect(created.data.screenshot_url).toBe(shotRes.data.url);

    // Validation errors
    const missingSymbol = await apiCall(
      "POST",
      "/me/journal",
      { symbol: "", side: "BUY", entry_price: 100 },
      tokenA,
    );
    expect(missingSymbol.status).toBe(422);

    // Simulate process restart and verify durability
    resetRuntime();
    const listAfterRestart = await apiCall(
      "GET",
      "/me/journal",
      undefined,
      tokenA,
    );
    expect(listAfterRestart.status).toBe(200);
    expect(listAfterRestart.data).toHaveLength(1);
    expect(listAfterRestart.data[0].notes).toContain("5m ORB high");

    // Cross-user isolation: User B cannot see, update, or delete User A's entry
    const listB = await apiCall("GET", "/me/journal", undefined, tokenB);
    expect(listB.status).toBe(200);
    expect(listB.data).toHaveLength(0);

    const hijackUpdate = await apiCall(
      "PUT",
      `/me/journal/${created.data.id}`,
      { notes: "tampered" },
      tokenB,
    );
    expect(hijackUpdate.status).toBe(404);

    const hijackDelete = await apiCall(
      "DELETE",
      `/me/journal/${created.data.id}`,
      undefined,
      tokenB,
    );
    expect(hijackDelete.status).toBe(404);

    // User A updates notes, strategy tags, and manual P&L
    const updated = await apiCall(
      "PUT",
      `/me/journal/${created.data.id}`,
      {
        pnl: 1680,
        strategy_tags: ["ORB", "VWAP Pullback"],
        notes: "Updated after brokerage deduction.",
      },
      tokenA,
    );
    expect(updated.status).toBe(200);
    expect(updated.data.pnl).toBe(1680);
    expect(updated.data.strategy_tags).toEqual(["ORB", "VWAP Pullback"]);
    expect(updated.data.notes).toBe("Updated after brokerage deduction.");

    // User A deletes entry (and cleans up unreferenced screenshot asset)
    const deleted = await apiCall(
      "DELETE",
      `/me/journal/${created.data.id}`,
      undefined,
      tokenA,
    );
    expect(deleted.status).toBe(200);

    const listFinal = await apiCall("GET", "/me/journal", undefined, tokenA);
    expect(listFinal.data).toHaveLength(0);

    const orphanMedia = await apiCall(
      "GET",
      shotRes.data.url.replace(/^\/api/, ""),
    );
    expect(orphanMedia.status).toBe(404);
  });
});

describe("TradingJournal UI Component", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports creating, filtering by strategy tag, editing, and deleting journal entries with screenshots", async () => {
    const { api } = await import("@/lib/api");
    const { default: TradingJournal } =
      await import("@/views/app/TradingJournal");

    let dbRows: Array<Record<string, unknown>> = [];

    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/me/journal") return { data: [...dbRows] };
      if (url === "/me/accounts") {
        return {
          data: {
            accounts: [
              { id: "acct-1", plan_name: "Pro", account_number: "IF-101" },
            ],
          },
        };
      }
      return { data: [] };
    });

    vi.spyOn(api, "post").mockImplementation(
      async (url: string, payload?: unknown) => {
        if (url === "/me/journal/screenshot") {
          return {
            data: {
              id: "jrnlimg_ui1",
              url: "/api/media/jrnlimg_ui1.png",
              content_type: "image/png",
              size: 68,
            },
          };
        }
        if (url === "/me/journal") {
          const body = payload as Record<string, unknown>;
          const created = {
            id: "jrnl_ui_1",
            ...body,
            pnl: Number(body["pnl"] ?? 1750),
            created_at: "2026-11-20T10:00:00.000Z",
            updated_at: "2026-11-20T10:00:00.000Z",
          };
          dbRows = [created, ...dbRows];
          return { data: created };
        }
        return { data: {} };
      },
    );

    vi.spyOn(api, "put").mockImplementation(
      async (url: string, payload?: unknown) => {
        const id = url.split("/").pop() || "";
        const body = payload as Record<string, unknown>;
        const updated = {
          ...dbRows.find((r) => r["id"] === id),
          ...body,
          id,
        };
        dbRows = dbRows.map((r) => (r["id"] === id ? updated : r));
        return { data: updated };
      },
    );

    vi.spyOn(api, "delete").mockImplementation(async (url: string) => {
      const id = url.split("/").pop() || "";
      dbRows = dbRows.filter((r) => r["id"] !== id);
      return { data: { ok: true, id } };
    });

    render(<TradingJournal />);

    // Initial empty state
    await screen.findByTestId("journal-empty-state");
    expect(screen.getByTestId("journal-kpi-total")).toHaveTextContent("0");

    // Open Create modal
    fireEvent.click(screen.getByTestId("journal-log-btn"));
    fireEvent.change(screen.getByTestId("journal-input-symbol"), {
      target: { value: "BANKNIFTY 52000 CE" },
    });
    fireEvent.change(screen.getByTestId("journal-input-entry"), {
      target: { value: "210" },
    });
    fireEvent.change(screen.getByTestId("journal-input-exit"), {
      target: { value: "260" },
    });
    fireEvent.change(screen.getByTestId("journal-input-qty"), {
      target: { value: "30" },
    });

    // Select preset strategy tag + add custom tag
    fireEvent.click(screen.getByTestId("journal-preset-tag-ORB"));
    fireEvent.change(screen.getByTestId("journal-custom-tag-input"), {
      target: { value: "Morning Momentum" },
    });
    fireEvent.click(screen.getByTestId("journal-add-tag-btn"));

    // Add notes
    fireEvent.change(screen.getByTestId("journal-input-notes"), {
      target: { value: "Waited for 5m candle close above VWAP." },
    });

    // Upload chart screenshot
    const fileInput = screen.getByTestId(
      "journal-screenshot-input",
    ) as HTMLInputElement;
    const pngFile = new File(["pngbytes"], "chart-orb.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [pngFile] } });

    await screen.findByTestId("journal-screenshot-preview");

    // Save entry
    fireEvent.click(screen.getByTestId("journal-save-btn"));

    await screen.findByTestId("journal-entry-jrnl_ui_1");
    expect(screen.getByTestId("journal-kpi-total")).toHaveTextContent("1");
    expect(screen.getByText("BANKNIFTY 52000 CE")).toBeInTheDocument();
    expect(screen.getByText("#Morning Momentum")).toBeInTheDocument();
    expect(screen.getByTestId("journal-shot-jrnl_ui_1")).toBeInTheDocument();

    // Filter by tag & search
    fireEvent.click(screen.getByTestId("journal-tag-filter-ORB"));
    expect(screen.getByTestId("journal-entry-jrnl_ui_1")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("journal-search"), {
      target: { value: "NONEXISTENT" },
    });
    expect(
      screen.queryByTestId("journal-entry-jrnl_ui_1"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("journal-search"), {
      target: { value: "" },
    });

    // Edit entry notes
    fireEvent.click(screen.getByTestId("journal-edit-jrnl_ui_1"));
    fireEvent.change(screen.getByTestId("journal-input-notes"), {
      target: { value: "Scaled out cleanly at resistance." },
    });
    fireEvent.click(screen.getByTestId("journal-save-btn"));

    await waitFor(() => {
      expect(
        screen.getByText("Scaled out cleanly at resistance."),
      ).toBeInTheDocument();
    });

    // Delete entry using inline confirmation
    fireEvent.click(screen.getByTestId("journal-delete-jrnl_ui_1"));
    fireEvent.click(screen.getByTestId("journal-confirm-delete-jrnl_ui_1"));

    await screen.findByTestId("journal-empty-state");
    expect(screen.getByTestId("journal-kpi-total")).toHaveTextContent("0");
  });
});
