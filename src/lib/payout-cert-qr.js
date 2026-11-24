import QRCode from "qrcode";
import jsQR from "jsqr";

export const DEFAULT_CERT_LAYOUT = {
  overlayMode: "details_and_qr", // "details_and_qr" | "qr_only"
  qrCorner: "bottom-right", // "bottom-right" | "bottom-left" | "top-right" | "top-left"
  qrSizePct: 17,
  qrOffsetX: 4,
  qrOffsetY: 5,
  textColor: "#f8fafc",
  accentColor: "#f5b638",
  textAlign: "center", // "center" | "left"
  nameY: 47,
  amountY: 60,
  metaY: 73,
  fontScale: 1,
};

export function generateCertificateCode(prefix = "IF-CERT") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${code}`;
}

export function buildVerificationUrl(code, originOverride = "") {
  const cleanCode = String(code || "").trim();
  const origin =
    originOverride ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://indifunded.com");
  return `${origin.replace(/\/$/, "")}/verify-payout?code=${encodeURIComponent(cleanCode)}`;
}

/**
 * Extracts a lookup code/ID and optional structured metadata from any scanned QR string.
 * Supports:
 * - Full verification URLs: https://.../verify-payout?code=IF-CERT-123456 or ?q=PO-1001
 * - Credential path URLs: https://.../verify/IF-CERT-123456
 * - JSON payloads: {"code":"IF-CERT-123456","trader_name":"...","amount":50000}
 * - Plain code strings: IF-CERT-123456 / PO-1001
 */
export function parseQrVerificationInput(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return { query: "", meta: null };

  // JSON payload support
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        const query = String(
          obj.certificate_code ||
            obj.code ||
            obj.payout_id ||
            obj.id ||
            obj.q ||
            "",
        ).trim();
        return {
          query,
          meta: {
            certificate_code: obj.certificate_code || obj.code || "",
            payout_id: obj.payout_id || "",
            trader_name: obj.trader_name || obj.name || "",
            amount: obj.amount || "",
            date: obj.payout_date || obj.date || "",
            plan: obj.plan || "",
          },
        };
      }
    } catch {
      // fall through
    }
  }

  // URL parsing (?code= / ?q= / ?id= or /verify/<code>)
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) {
    try {
      const u = new URL(raw, "https://indifunded.com");
      const paramCode =
        u.searchParams.get("code") ||
        u.searchParams.get("q") ||
        u.searchParams.get("id") ||
        "";
      if (paramCode.trim()) {
        return { query: paramCode.trim(), meta: null };
      }
      const matchVerify = u.pathname.match(/\/verify(?:-payout)?\/([^/?#]+)/i);
      if (matchVerify?.[1]) {
        return { query: decodeURIComponent(matchVerify[1]).trim(), meta: null };
      }
    } catch {
      // fall through
    }
  }

  return { query: raw.slice(0, 120), meta: null };
}

function formatInrNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `₹${n.toLocaleString("en-IN")}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawFallbackBackdrop(ctx, width, height, accentColor = "#f5b638") {
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#0b101b");
  grad.addColorStop(0.55, "#111827");
  grad.addColorStop(1, "#090d16");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle radial highlight
  const glow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.25,
    10,
    width * 0.5,
    height * 0.35,
    width * 0.65,
  );
  glow.addColorStop(0, "rgba(245, 182, 56, 0.14)");
  glow.addColorStop(1, "rgba(245, 182, 56, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Double gold frame
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.strokeRect(width * 0.03, height * 0.04, width * 0.94, height * 0.92);

  ctx.strokeStyle = "rgba(245, 182, 56, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(width * 0.042, height * 0.056, width * 0.916, height * 0.888);

  // Header branding
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = accentColor;
  ctx.font = `700 ${Math.round(height * 0.032)}px "JetBrains Mono", monospace`;
  ctx.fillText(
    "INDIFUNDED · OFFICIAL PAYOUT CERTIFICATE",
    width * 0.5,
    height * 0.16,
  );

  ctx.fillStyle = "#e2e8f0";
  ctx.font = `500 ${Math.round(height * 0.026)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(
    "THIS CERTIFICATE IS PROUDLY PRESENTED TO",
    width * 0.5,
    height * 0.27,
  );
  ctx.restore();
}

export async function generateQrDataUrl(value, size = 320) {
  return QRCode.toDataURL(
    String(value || "https://indifunded.com/verify-payout"),
    {
      errorCorrectionLevel: "M",
      margin: 2,
      width: size,
      color: {
        dark: "#0b0e14",
        light: "#ffffff",
      },
    },
  );
}

export async function generateCertificateImage({
  designImageUrl = "",
  traderName = "",
  amount = 0,
  payoutDate = "",
  plan = "",
  accountSize = 0,
  certificateCode = "",
  payoutId = "",
  verificationUrl = "",
  layout = DEFAULT_CERT_LAYOUT,
}) {
  if (typeof document === "undefined") {
    throw new Error(
      "Certificate canvas generation requires a browser environment",
    );
  }

  const cfg = { ...DEFAULT_CERT_LAYOUT, ...(layout || {}) };
  const code = String(
    certificateCode || payoutId || generateCertificateCode(),
  ).trim();
  const verifyUrl = verificationUrl || buildVerificationUrl(code);
  const qrDataUrl = await generateQrDataUrl(verifyUrl, 360);
  const qrImg = await loadImage(qrDataUrl);

  let bgImg = null;
  if (designImageUrl) {
    try {
      bgImg = await loadImage(designImageUrl);
    } catch {
      bgImg = null;
    }
  }

  const MAX_DIM = 1360;
  let width = 1280;
  let height = 840;
  if (bgImg && bgImg.naturalWidth > 0 && bgImg.naturalHeight > 0) {
    const scale = Math.min(
      1,
      MAX_DIM / Math.max(bgImg.naturalWidth, bgImg.naturalHeight),
    );
    width = Math.max(480, Math.round(bgImg.naturalWidth * scale));
    height = Math.max(320, Math.round(bgImg.naturalHeight * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, width, height);
  } else {
    drawFallbackBackdrop(ctx, width, height, cfg.accentColor);
  }

  // Draw text details overlay if enabled
  if (cfg.overlayMode !== "qr_only") {
    ctx.save();
    const isLeft = cfg.textAlign === "left";
    const anchorX = isLeft ? width * 0.08 : width * 0.5;
    ctx.textAlign = isLeft ? "left" : "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = Math.max(4, height * 0.01);
    ctx.shadowOffsetY = 2;

    const fs = Number(cfg.fontScale) || 1;
    const minSide = Math.min(width, height);

    if (traderName) {
      ctx.fillStyle = cfg.textColor || "#f8fafc";
      const nameSize = Math.round(minSide * 0.072 * fs);
      ctx.font = `700 ${nameSize}px Georgia, "Times New Roman", serif`;
      ctx.fillText(
        String(traderName).trim(),
        anchorX,
        height * ((cfg.nameY ?? 47) / 100),
      );
    }

    const amountFormatted = formatInrNum(amount);
    if (amountFormatted) {
      ctx.fillStyle = cfg.accentColor || "#f5b638";
      const amtSize = Math.round(minSide * 0.084 * fs);
      ctx.font = `800 ${amtSize}px "JetBrains Mono", system-ui, sans-serif`;
      ctx.fillText(
        amountFormatted,
        anchorX,
        height * ((cfg.amountY ?? 60) / 100),
      );
    }

    const metaParts = [];
    if (plan) metaParts.push(`${plan} Plan`);
    if (Number(accountSize) > 0)
      metaParts.push(`Account ${formatInrNum(accountSize)}`);
    if (payoutDate) metaParts.push(`Date ${payoutDate}`);
    if (payoutId) metaParts.push(`Payout ${payoutId}`);
    if (metaParts.length) {
      ctx.fillStyle = cfg.textColor || "#e2e8f0";
      const metaSize = Math.round(minSide * 0.028 * fs);
      ctx.font = `600 ${metaSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(
        metaParts.join("  •  "),
        anchorX,
        height * ((cfg.metaY ?? 73) / 100),
      );
    }

    ctx.restore();
  }

  // Draw crisp white-framed QR badge in the chosen corner
  const minDim = Math.min(width, height);
  const qrSize = Math.max(
    76,
    Math.round(minDim * ((Number(cfg.qrSizePct) || 17) / 100)),
  );
  const pad = Math.max(8, Math.round(qrSize * 0.09));
  const labelHeight = Math.max(22, Math.round(qrSize * 0.24));
  const boxW = qrSize + pad * 2;
  const boxH = qrSize + pad * 2 + labelHeight;

  const marginX = Math.round(width * ((Number(cfg.qrOffsetX) ?? 4) / 100));
  const marginY = Math.round(height * ((Number(cfg.qrOffsetY) ?? 5) / 100));

  let boxX = width - boxW - marginX;
  let boxY = height - boxH - marginY;
  if (cfg.qrCorner === "bottom-left") {
    boxX = marginX;
    boxY = height - boxH - marginY;
  } else if (cfg.qrCorner === "top-right") {
    boxX = width - boxW - marginX;
    boxY = marginY;
  } else if (cfg.qrCorner === "top-left") {
    boxX = marginX;
    boxY = marginY;
  }

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  drawRoundedRect(
    ctx,
    boxX,
    boxY,
    boxW,
    boxH,
    Math.max(8, Math.round(qrSize * 0.08)),
  );
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Subtle gold/dark hairline around QR badge
  ctx.save();
  drawRoundedRect(
    ctx,
    boxX,
    boxY,
    boxW,
    boxH,
    Math.max(8, Math.round(qrSize * 0.08)),
  );
  ctx.strokeStyle = "rgba(15, 23, 42, 0.14)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.drawImage(qrImg, boxX + pad, boxY + pad, qrSize, qrSize);

  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const codeFontSize = Math.max(9, Math.round(labelHeight * 0.42));
  ctx.font = `700 ${codeFontSize}px "JetBrains Mono", monospace`;
  ctx.fillText(code, boxX + boxW / 2, boxY + pad + qrSize + labelHeight * 0.36);

  ctx.fillStyle = "#64748b";
  const subFontSize = Math.max(7, Math.round(labelHeight * 0.3));
  ctx.font = `600 ${subFontSize}px system-ui, sans-serif`;
  ctx.fillText(
    "SCAN TO VERIFY",
    boxX + boxW / 2,
    boxY + pad + qrSize + labelHeight * 0.78,
  );
  ctx.restore();

  const pngUrl = canvas.toDataURL("image/png");
  const imageDataUrl =
    pngUrl.length <= 950_000 ? pngUrl : canvas.toDataURL("image/jpeg", 0.92);

  return {
    imageDataUrl,
    qrDataUrl,
    verificationUrl: verifyUrl,
    certificateCode: code,
  };
}

function scanCanvasRegion(source, sx, sy, sw, sh, targetWidth) {
  const canvas = document.createElement("canvas");
  const scale = targetWidth / Math.max(1, sw);
  const w = Math.max(64, Math.round(sw * scale));
  const h = Math.max(64, Math.round(sh * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  return jsQR(imgData.data, w, h, { inversionAttempts: "attemptBoth" });
}

/**
 * High-accuracy multi-pass QR decoder for uploaded QR screenshots or full certificates.
 * Scans full frame plus corner quadrants (upscaled) so small corner QRs decode reliably.
 */
export async function decodeQrFromFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

  const img = await loadImage(dataUrl);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;

  // Pass 1: Full image (native up to 1400px)
  const fullHit = scanCanvasRegion(
    img,
    0,
    0,
    iw,
    ih,
    Math.min(1400, Math.max(iw, 600)),
  );
  if (fullHit?.data) return fullHit.data;

  // Pass 2: Corner & center crops upscaled cleanly (handles full payout certificate images!)
  const regions = [
    [iw * 0.55, ih * 0.5, iw * 0.45, ih * 0.5], // bottom-right
    [0, ih * 0.5, iw * 0.45, ih * 0.5], // bottom-left
    [iw * 0.55, 0, iw * 0.45, ih * 0.5], // top-right
    [0, 0, iw * 0.45, ih * 0.5], // top-left
    [iw * 0.2, ih * 0.2, iw * 0.6, ih * 0.6], // center
  ];
  for (const [rx, ry, rw, rh] of regions) {
    const hit = scanCanvasRegion(img, rx, ry, rw, rh, 720);
    if (hit?.data) return hit.data;
  }
  return null;
}

export function decodeQrFromVideoFrame(video, canvas) {
  const vw = video?.videoWidth;
  const vh = video?.videoHeight;
  if (!vw || !vh || !canvas) return null;
  const w = Math.min(720, vw);
  const h = Math.round((vh / vw) * w);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const res = jsQR(imgData.data, w, h, { inversionAttempts: "dontInvert" });
  return res?.data || null;
}
