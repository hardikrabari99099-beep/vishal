import { describe, expect, it } from "vitest";
import { getReviewMedia, safeReviewImage } from "../lib/review-media";

describe("admin review media", () => {
  it("supports direct HTTPS videos", () => {
    expect(
      getReviewMedia("https://media.example.com/trader.mp4?token=public"),
    ).toEqual({
      kind: "video",
      url: "https://media.example.com/trader.mp4?token=public",
    });
  });
  it("converts YouTube watch and short links to privacy enhanced embeds", () => {
    expect(getReviewMedia("https://youtu.be/dQw4w9WgXcQ")?.url).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0",
    );
    expect(
      getReviewMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.kind,
    ).toBe("youtube");
  });
  it("converts Vimeo links", () => {
    expect(getReviewMedia("https://vimeo.com/123456789")?.url).toBe(
      "https://player.vimeo.com/video/123456789?autoplay=1",
    );
  });
  it("rejects executable URLs, insecure URLs and impostor providers", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://media.example.com/a.mp4",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/invalid",
      "",
    ])
      expect(getReviewMedia(url)).toBeNull();
    expect(safeReviewImage("javascript:alert(1)")).toBeUndefined();
  });

  it("normalizes browser MIME variants and filename extensions for admin media upload", async () => {
    const { resolveMediaMimeType } = await import("../lib/media-upload");
    expect(
      resolveMediaMimeType(
        { name: "clip.mp4", type: "video/mp4; codecs=avc1.42E01E" },
        "video",
      ),
    ).toBe("video/mp4");
    expect(
      resolveMediaMimeType({ name: "mobile.m4v", type: "video/x-m4v" }, "video"),
    ).toBe("video/mp4");
    expect(
      resolveMediaMimeType(
        { name: "ios_rec.mov", type: "application/octet-stream" },
        "video",
      ),
    ).toBe("video/quicktime");
    expect(
      resolveMediaMimeType({ name: "screen.webm", type: "" }, "video"),
    ).toBe("video/webm");
  });

  it("handles multi-chunk video upload and GET/HEAD range streaming on Node runtime", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "if-media-test-"));
    const storeFile = path.join(tmpDir, ".indifunded-store.local");

    process.env["INDIFUNDED_STORE_FILE"] = storeFile;
    process.env["ADMIN_EMAIL"] = "admin@indifunded.com";
    process.env["ADMIN_PASSWORD"] = "MediaTestPass!2026";
    delete (globalThis as Record<string, unknown>)["__indifundedRuntimeStore"];

    try {
      const { handleApi } = await import("../server/api-handler");
      const loginRes = await handleApi(
        new Request("http://localhost:3000/api/auth/admin-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "admin@indifunded.com",
            password: "MediaTestPass!2026",
          }),
        }),
        "auth/admin-login",
      );
      const { token } = (await loginRes.json()) as { token: string };
      expect(token).toBeTruthy();

      const rawBytes = Buffer.from("ftypmp42-sample-video-payload-1234567890");
      const b64 = rawBytes.toString("base64");
      const mid = Math.floor(b64.length / 2);
      const uploadId = "11111111-2222-4333-8444-555555555555";

      const part1 = await handleApi(
        new Request("http://localhost:3000/api/admin/media", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            upload_id: uploadId,
            index: 0,
            total: 2,
            content_type: "video/x-m4v",
            filename: "trader-clip.m4v",
            chunk: b64.slice(0, mid),
          }),
        }),
        "admin/media",
      );
      expect(part1.status).toBe(200);

      const part2 = await handleApi(
        new Request("http://localhost:3000/api/admin/media", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            upload_id: uploadId,
            index: 1,
            total: 2,
            content_type: "video/x-m4v",
            filename: "trader-clip.m4v",
            chunk: b64.slice(mid),
          }),
        }),
        "admin/media",
      );
      expect(part2.status).toBe(200);
      const uploaded = (await part2.json()) as { url: string; size: number };
      expect(uploaded.url).toMatch(/^\/api\/media\/vid_.*\.mp4$/);
      expect(uploaded.size).toBe(rawBytes.length);

      const filename = uploaded.url.replace("/api/media/", "");
      const headRes = await handleApi(
        new Request(`http://localhost:3000/api${uploaded.url}`, {
          method: "HEAD",
        }),
        `media/${filename}`,
      );
      expect(headRes.status).toBe(200);
      expect(headRes.headers.get("content-type")).toBe("video/mp4");

      const rangeRes = await handleApi(
        new Request(`http://localhost:3000/api${uploaded.url}`, {
          method: "GET",
          headers: { range: "bytes=0-7" },
        }),
        `media/${filename}`,
      );
      expect(rangeRes.status).toBe(206);
      const sliced = Buffer.from(await rangeRes.arrayBuffer()).toString("utf8");
      expect(sliced).toBe("ftypmp42");
    } finally {
      delete process.env["INDIFUNDED_STORE_FILE"];
      delete process.env["ADMIN_EMAIL"];
      delete process.env["ADMIN_PASSWORD"];
      delete (globalThis as Record<string, unknown>)[
        "__indifundedRuntimeStore"
      ];
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

