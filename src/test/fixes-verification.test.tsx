import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

type MockLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "children"
> & {
  to?: string;
  children?: React.ReactNode;
};

vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children, ...rest }: MockLinkProps) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

describe("Login timeout, email fallback, video autoplay, and Top 10 trader photos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock("@/server/mailer");
    vi.doUnmock("@/context/SettingsContext");
    delete process.env["INDIFUNDED_STORE_FILE"];
    delete (globalThis as Record<string, unknown>)["__indifundedRuntimeStore"];
  });

  it("renders trader photos in homepage Top 10 leaderboard and falls back cleanly on image error", async () => {
    const { api } = await import("@/lib/api");
    vi.spyOn(api, "get").mockResolvedValue({
      data: [
        {
          id: "lb-1",
          name: "Aarav Verma",
          plan: "Pro",
          city: "Mumbai",
          total_payout: 245000,
          avatar_url: "https://cdn.example.com/aarav.jpg",
        },
        {
          id: "lb-2",
          name: "Neha Kulkarni",
          plan: "Elite",
          city: "Pune",
          total_payout: 185000,
          avatar_url: "",
        },
      ],
    } as never);

    const { MonthlyLeaderboard } = await import("@/components/HomeSections");
    const view = render(<MonthlyLeaderboard />);

    const img = await waitFor(() => {
      const el = view.container.querySelector(
        '[data-testid="home-board-row-0"] .board-avatar img',
      );
      expect(el).toBeTruthy();
      return el as HTMLImageElement;
    });
    expect(img).toHaveAttribute("src", "https://cdn.example.com/aarav.jpg");
    expect(
      view.container.querySelector(
        '[data-testid="home-board-row-1"] .board-avatar span',
      )?.textContent,
    ).toBe("N");

    fireEvent.error(img);
    await waitFor(() => {
      expect(
        view.container.querySelector(
          '[data-testid="home-board-row-0"] .board-avatar span',
        )?.textContent,
      ).toBe("A");
    });
  });

  it("configures muted inline autoplay attributes on OurTraders and ClientReviews players", async () => {
    vi.doMock("@/context/SettingsContext", () => ({
      useSettings: () => ({
        settings: {
          home_sections: { trader_videos: true },
          video_reviews: {
            enabled: true,
            items: [
              {
                name: "Rohan Desai",
                url: "/api/media/vid_sample.mp4",
              },
              {
                name: "Kiran Patel",
                url: "https://youtu.be/dQw4w9WgXcQ",
              },
            ],
          },
        },
        loading: false,
        reload: vi.fn(),
        syncVersion: 1,
      }),
    }));
    vi.resetModules();

    const { default: OurTraders } = await import("@/components/OurTraders");
    const view = render(<OurTraders />);

    const video = view.container.querySelector("video") as HTMLVideoElement;
    const iframe = view.container.querySelector("iframe") as HTMLIFrameElement;

    expect(video).toBeTruthy();
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.getAttribute("preload")).toBe("auto");

    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(iframe.getAttribute("src")).toContain("enablejsapi=1");
  });

  it("completes /auth/signup and /auth/firebase-login immediately even when SMTP stalls", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "indifunded-fast-"));
    process.env["INDIFUNDED_STORE_FILE"] = path.join(
      tempDir,
      ".indifunded-store.local",
    );
    delete (globalThis as Record<string, unknown>)["__indifundedRuntimeStore"];

    const neverResolves = () => new Promise<never>(() => {});
    vi.doMock("@/server/mailer", async (importOriginal) => {
      const mod = (await importOriginal()) as Record<string, unknown>;
      return {
        ...mod,
        resolveEmailConfig: vi.fn(() => ({
          provider: "gmail",
          smtp_host: "smtp.gmail.com",
          smtp_port: 465,
          smtp_secure: true,
          smtp_user: "indifunded@gmail.com",
          smtp_password: "abcdefghijklmnop",
          from_email: "indifunded@gmail.com",
          welcome_enabled: true,
          login_welcome_enabled: true,
        })),
        sendWelcomeEmail: vi.fn(neverResolves),
        sendLoginWelcomeEmail: vi.fn(neverResolves),
      };
    });

    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            users: [
              {
                localId: "fb-user-1",
                email: "fast.trader@example.com",
                emailVerified: true,
                displayName: "Fast Trader",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.resetModules();

    const { handleApi } = await import("@/server/api-handler");
    const t0 = Date.now();
    const res = await handleApi(
      new Request("http://localhost/api/auth/firebase-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "valid-token" }),
      }),
      "auth/firebase-login",
    );
    const elapsed = Date.now() - t0;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(1500);
    const payload = await res.json();
    expect(payload.token).toBeTruthy();

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  it("formats timeout of 15000ms exceeded cleanly and lets env SMTP fallback work on unconfigured saved docs", async () => {
    const { friendlyAuthError } = await import("@/lib/auth-messages");
    expect(friendlyAuthError("timeout of 15000ms exceeded")).toContain(
      "taking longer than expected",
    );

    vi.stubEnv("GMAIL_USER", "indifunded@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
    vi.resetModules();
    const { resolveEmailConfig } = await import("@/server/mailer");

    const fromSavedEmpty = resolveEmailConfig({
      id: "email_config",
      smtp_user: "",
      smtp_password: "",
      password_cleared: false,
    });
    expect(fromSavedEmpty.smtp_user).toBe("indifunded@gmail.com");
    expect(fromSavedEmpty.smtp_password).toBe("abcdefghijklmnop");

    const fromCleared = resolveEmailConfig({
      id: "email_config",
      smtp_user: "",
      smtp_password: "",
      password_cleared: true,
    });
    expect(fromCleared.smtp_password).toBe("");
  });
});
