export type ReviewMedia = { kind: "video" | "youtube" | "vimeo"; url: string };

const LOCAL_MEDIA_RE =
  /^\/api\/media\/[\w-]+(?:\.(?:mp4|webm|mov))?(?:\?[\w=&-]+)?$/i;

export function getReviewMedia(value: string): ReviewMedia | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (LOCAL_MEDIA_RE.test(raw)) {
    return { kind: "video", url: raw };
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(
        host,
      )
    ) {
      const id =
        host === "youtu.be"
          ? url.pathname.slice(1)
          : url.searchParams.get("v") ||
            url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
      if (!id || !/^[\w-]{11}$/.test(id)) return null;
      return {
        kind: "youtube",
        url: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
      };
    }
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
      const id = url.pathname.match(/\/(\d+)\/?$/)?.[1];
      return id
        ? {
            kind: "vimeo",
            url: `https://player.vimeo.com/video/${id}?autoplay=1`,
          }
        : null;
    }
    if (/\.(mp4|webm|mov)$/i.test(url.pathname))
      return { kind: "video", url: url.href };
    return null;
  } catch {
    return null;
  }
}

export function getReviewPreviewUrl(media: ReviewMedia): string {
  if (media.kind === "youtube") {
    const id = media.url.match(/embed\/([\w-]{11})/)?.[1];
    if (id) {
      return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0`;
    }
  }
  if (media.kind === "vimeo") {
    const id = media.url.match(/video\/(\d+)/)?.[1];
    if (id) {
      return `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&loop=1&background=1`;
    }
  }
  return media.url;
}

export function getReviewThumbnail(
  media: ReviewMedia,
  poster?: string,
): string | undefined {
  const image = safeReviewImage(poster ?? "");
  if (image) return image;
  const id =
    media.kind === "youtube" && media.url.match(/embed\/([\w-]{11})/)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}

export function safeReviewImage(value: string): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  if (/^\/api\/media\/[\w-]+(?:\.(?:jpg|jpeg|png|webp))?$/i.test(raw))
    return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
