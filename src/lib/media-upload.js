import { api } from "./api";

const EXT_MIME_MAP = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const SUPPORTED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const SUPPORTED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function resolveMediaMimeType(file, kind = "video") {
  const rawType = String(file?.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const normalized =
    rawType === "video/x-m4v"
      ? "video/mp4"
      : rawType === "image/jpg"
        ? "image/jpeg"
        : rawType;
  const allowed = kind === "image" ? SUPPORTED_IMAGE_MIMES : SUPPORTED_VIDEO_MIMES;
  if (allowed.has(normalized)) return normalized;

  const ext = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  const inferred = (ext && EXT_MIME_MAP[ext]) || "";
  if (allowed.has(inferred)) return inferred;
  return "";
}

function makeUploadId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const hex = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const commaIdx = raw.indexOf(",");
      if (commaIdx === -1) {
        reject(new Error("Could not read file contents."));
        return;
      }
      resolve(raw.slice(commaIdx + 1).replace(/\s+/g, ""));
    };
    reader.onerror = () => reject(new Error("Could not read selected file."));
    reader.readAsDataURL(file);
  });
}

// Upload video or poster image via ~384KB proxy-safe chunks on every runtime,
// falling back to direct multipart/data_url only if needed.
export async function uploadAdminMedia(
  file,
  { kind = "video", onProgress } = {},
) {
  if (!file) throw new Error("No file selected.");
  const maxBytes = kind === "image" ? 6 * 1024 * 1024 : 18 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      kind === "image"
        ? "Poster image must be under 6 MB."
        : "Video must be under 18 MB.",
    );
  }

  const contentType = resolveMediaMimeType(file, kind);
  if (!contentType) {
    throw new Error(
      kind === "image"
        ? "Unsupported image format. Please choose JPG, PNG, or WebP."
        : "Unsupported video format. Please choose MP4, WebM, or MOV.",
    );
  }

  const base64 = await readFileAsBase64(file);
  if (!base64) throw new Error("Selected file is empty.");

  // 524,288 base64 chars (~384 KB binary) stays well under 1 MB reverse-proxy limits.
  const chunkSize = 524288;
  const parts = [];
  for (let i = 0; i < base64.length; i += chunkSize) {
    parts.push(base64.slice(i, i + chunkSize));
  }

  const uploadId = makeUploadId();
  let lastData = null;

  for (let index = 0; index < parts.length; index++) {
    try {
      const response = await api.post(
        "/admin/media",
        {
          upload_id: uploadId,
          index,
          total: parts.length,
          content_type: contentType,
          chunk: parts[index],
          filename: file.name || `upload-${index}`,
        },
        { timeout: 60000 },
      );
      lastData = response.data;
      if (typeof onProgress === "function") {
        onProgress(Math.round(((index + 1) / parts.length) * 100));
      }
    } catch (error) {
      if (index === 0 && error?.response?.status === 400) {
        const fallbackRes = await api.post(
          "/admin/media",
          {
            data_url: `data:${contentType};base64,${base64}`,
            filename: file.name || "media",
          },
          { timeout: 60000 },
        );
        lastData = fallbackRes.data;
        if (typeof onProgress === "function") onProgress(100);
        break;
      }
      throw error;
    }
  }

  if (!lastData?.url) {
    throw new Error("Server did not return an uploaded media URL.");
  }
  return lastData;
}
