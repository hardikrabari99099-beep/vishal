import fs from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { handleApi } from "@/server/api-handler";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("verifies Firebase sessions without reading configuration from the runtime filesystem", async () => {
  const existsSync = fs.existsSync;
  vi.spyOn(fs, "existsSync").mockImplementation((file) =>
    String(file).endsWith("firebase-applet-config.json")
      ? false
      : existsSync(file),
  );
  vi.stubEnv("FIREBASE_WEB_API_KEY", "");
  vi.stubGlobal("fetch", async () => new Response(null, { status: 401 }));

  const response = await handleApi(
    new Request("http://localhost/api/auth/firebase-login", {
      method: "POST",
      body: JSON.stringify({ idToken: "invalid-test-token" }),
    }),
    "auth/firebase-login",
  );

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ detail: "Invalid Firebase session" });
});
