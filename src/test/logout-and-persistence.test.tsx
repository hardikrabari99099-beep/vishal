import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
  navMock: vi.fn(),
  location: { pathname: "/admin", search: "" },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: mocks.signOutMock,
      getSession: mocks.getSessionMock,
      onAuthStateChange: mocks.onAuthStateChangeMock,
    },
  },
}));

vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to?: string;
    children?: React.ReactNode;
  }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
  NavLink: ({
    to,
    children,
    className,
    end: _end,
    ...rest
  }: {
    to?: string;
    children?: React.ReactNode;
    className?: string | ((s: { isActive: boolean }) => string);
    end?: boolean;
  }) => (
    <a
      href={typeof to === "string" ? to : "#"}
      className={
        typeof className === "function"
          ? className({ isActive: false })
          : className
      }
      {...rest}
    >
      {children}
    </a>
  ),
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="redirect-navigate" data-to={to} />
  ),
  Outlet: () => <div data-testid="protected-outlet">Protected Content</div>,
  useNavigate: () => mocks.navMock,
  useLocation: () => mocks.location,
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock("@/components/Showcase3D", () => ({
  default: () => null,
}));

vi.mock("@/components/BrandLogo", () => ({
  default: () => <span>IndiFunded</span>,
}));

describe("Logout Try-Catch & Zero-Hang Session Termination", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.location = { pathname: "/admin", search: "" };
    mocks.signOutMock.mockResolvedValue({ error: null });
    mocks.getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
    document.body.removeAttribute("data-scroll-locked");
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("handles errors in signOut, storage cleanup, and fetch inside try-catch without hanging", async () => {
    const { AuthProvider, useAuth } = await import("@/context/AuthContext");
    const { api, setAdminToken } = await import("@/lib/api");

    setAdminToken("ifa.fake.token");
    window.localStorage.setItem(
      "if_local_auth_session",
      JSON.stringify({ access_token: "ift.fake.token" }),
    );
    document.body.style.pointerEvents = "none";
    document.body.style.overflow = "hidden";
    document.body.setAttribute("data-scroll-locked", "1");

    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/auth/me") {
        return {
          data: { id: "adm-1", email: "owner@indifunded.com", role: "admin" },
        };
      }
      return { data: {} };
    });

    mocks.signOutMock.mockImplementation(() => {
      throw new Error("Simulated GoTrue lock failure");
    });
    const removeSpy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked storage access", "SecurityError");
      });
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("Network down")) as unknown as typeof fetch;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let capturedAuth: ReturnType<typeof useAuth> | null = null;
    function Probe() {
      const auth = useAuth();
      capturedAuth = auth;
      const u = auth.user as { email?: string } | null;
      return <div data-testid="auth-user">{u ? u.email : "signed-out"}</div>;
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-user")).toHaveTextContent(
        "owner@indifunded.com",
      );
    });

    await act(async () => {
      await expect(capturedAuth!.logout()).resolves.toBeUndefined();
    });

    expect(screen.getByTestId("auth-user")).toHaveTextContent("signed-out");
    expect(document.body.style.pointerEvents).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
    expect(warnSpy).toHaveBeenCalled();

    removeSpy.mockRestore();
  });

  it("navigates cleanly from AdminLayout to /login on Logout without a hanging signOut promise", async () => {
    const { AuthProvider } = await import("@/context/AuthContext");
    const { default: AdminLayout } = await import("@/views/admin/AdminLayout");
    const { api, setAdminToken } = await import("@/lib/api");

    setAdminToken("ifa.admin.token");
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/auth/me") {
        return {
          data: { id: "adm-1", email: "owner@indifunded.com", role: "admin" },
        };
      }
      return { data: {} };
    });
    // Simulate a stalled Supabase signOut promise that never resolves
    mocks.signOutMock.mockImplementation(() => new Promise(() => {}));

    render(
      <AuthProvider>
        <AdminLayout />
      </AuthProvider>,
    );

    const logoutBtn = await screen.findByTestId("admin-logout");
    fireEvent.click(logoutBtn);

    await waitFor(
      () => {
        expect(mocks.navMock).toHaveBeenCalledWith("/login", { replace: true });
      },
      { timeout: 1500 },
    );
    expect(screen.queryByTestId("redirect-navigate")).not.toBeInTheDocument();
  });
});

describe("Durable Store Snapshot Persistence & Backup Recovery", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "indifunded-store-test-"),
  );
  const storeFile = path.join(tempDir, ".indifunded-store.local");

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
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
  }

  beforeEach(() => {
    process.env["INDIFUNDED_STORE_FILE"] = storeFile;
    process.env["ADMIN_EMAIL"] = "admin@indifunded.com";
    process.env["ADMIN_PASSWORD"] = "TestAdminPass!2026";
    resetRuntime();
  });

  afterEach(() => {
    delete process.env["INDIFUNDED_STORE_FILE"];
    delete process.env["ADMIN_EMAIL"];
    delete process.env["ADMIN_PASSWORD"];
    resetRuntime();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("persists signed-up users and settings across server restarts and recovers from primary file corruption via backup", async () => {
    const signup = await apiCall("POST", "/auth/signup", {
      name: "Kiran Verma",
      email: "kiran.verma@example.in",
      password: "Password@123",
      phone: "9876543210",
    });
    expect(signup.status).toBe(200);

    const adm = await apiCall("POST", "/auth/admin-login", {
      email: "admin@indifunded.com",
      password: "TestAdminPass!2026",
    });
    const adminToken = String(adm.data.token);

    const putSettings = await apiCall(
      "PUT",
      "/settings",
      { announcement: { enabled: true, text: "Saved Banner Text" } },
      adminToken,
    );
    expect(putSettings.status).toBe(200);
    expect(fs.existsSync(storeFile)).toBe(true);
    expect(fs.existsSync(`${storeFile}.bak`)).toBe(true);

    // Simulate full server process restart
    resetRuntime();

    const loginAfterRestart = await apiCall("POST", "/auth/local-login", {
      email: "kiran.verma@example.in",
      password: "Password@123",
    });
    expect(loginAfterRestart.status).toBe(200);
    expect(loginAfterRestart.data.user.email).toBe("kiran.verma@example.in");

    const settingsAfterRestart = await apiCall("GET", "/settings");
    expect(settingsAfterRestart.data.announcement?.text).toBe(
      "Saved Banner Text",
    );

    // Simulate corrupt primary snapshot on disk -> should recover from .bak without losing user
    fs.writeFileSync(storeFile, "{corrupt json", "utf8");
    resetRuntime();

    const loginAfterCorruption = await apiCall("POST", "/auth/local-login", {
      email: "kiran.verma@example.in",
      password: "Password@123",
    });
    expect(loginAfterCorruption.status).toBe(200);
  });
});
