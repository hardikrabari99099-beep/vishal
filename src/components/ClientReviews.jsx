import { useCallback, useState } from "react";
import { Play, Quote, Star, TrendingUp, Video, Volume2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { useSettings } from "../context/SettingsContext";
import { getReviewMedia, getReviewPreviewUrl, getReviewThumbnail } from "../lib/review-media";
import { useOffscreenPause } from "../lib/useOffscreenPause";

function safePlayMedia(el, mutedFallback = false) {
  if (!el) return;
  try {
    if (mutedFallback) el.muted = true;
    const attempt = el.play?.();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        el.muted = true;
        try {
          el.play?.().catch(() => {});
        } catch {
          // ignore non-media environments
        }
      });
    }
  } catch {
    // ignore non-media environments
  }
}

function VideoTile({ item, onOpen, decorative, shouldAutoplay }) {
  const media = getReviewMedia(item.url);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const previewVideoRef = useCallback((el) => {
    if (el) safePlayMedia(el, true);
  }, []);
  if (!media) return null;
  const thumb = getReviewThumbnail(media, item.poster);
  const displayName = item.name?.trim() || "IndiFunded trader";
  const initial = displayName.slice(0, 1).toUpperCase();
  const previewUrl = getReviewPreviewUrl(media);
  const canAutoplayInline = shouldAutoplay && !videoFailed;

  return (
    <button
      type="button"
      className="wall-video"
      onClick={() => onOpen(item)}
      tabIndex={decorative ? -1 : 0}
      aria-label={`Watch ${item.name || "trader"}'s short review with sound`}
    >
      {canAutoplayInline ? (
        media.kind === "video" ? (
          <video
            ref={previewVideoRef}
            src={previewUrl}
            poster={thumb && !thumbFailed ? thumb : undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <iframe
            src={previewUrl}
            title={`${displayName}'s review preview`}
            allow="autoplay; encrypted-media; picture-in-picture"
            loading="lazy"
            tabIndex={-1}
            aria-hidden="true"
          />
        )
      ) : thumb && !thumbFailed ? (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <span className="wall-video-placeholder" aria-hidden="true">
          <span className="wall-video-avatar">{initial}</span>
          <span className="wall-video-play-badge">
            <Play size={22} fill="currentColor" />
          </span>
        </span>
      )}
      <span className="wall-video-shade" />
      <span className="wall-video-sound">
        {canAutoplayInline ? <Volume2 size={13} /> : <Play size={13} />}
        {canAutoplayInline ? "Tap for sound" : "Watch review"}
      </span>
      <span className="wall-video-meta">
        <strong>{displayName}</strong>
        <span>{item.label || item.role || "Trader review"}</span>
      </span>
    </button>
  );
}

function QuoteTile({ item, accent }) {
  return (
    <article className={`review-quote ${accent ? "review-quote-accent" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 text-primary">
          {Array.from({ length: 5 }, (_, j) => (
            <Star key={j} size={13} fill="currentColor" />
          ))}
        </div>
        <Quote size={18} className="text-muted-foreground" />
      </div>
      <blockquote>“{item.q}”</blockquote>
      <div className="review-author">
        <span className="review-avatar">{(item.a || "T").slice(0, 1)}</span>
        <div>
          <strong>{item.a}</strong>
          <span>{item.r}</span>
        </div>
      </div>
    </article>
  );
}

function StatTile({ value, label }) {
  return (
    <div className="wall-stat" aria-hidden="true">
      <TrendingUp size={18} />
      <svg viewBox="0 0 200 60" preserveAspectRatio="none">
        <path d="M0 50 L25 42 L50 46 L75 30 L100 34 L125 18 L150 24 L175 8 L200 12" />
      </svg>
      <strong className="font-display">{value || "70%"}</strong>
      <span>{label || "Profit split for funded traders"}</span>
    </div>
  );
}

export default function ClientReviews({ quotesOnly = false, heading = "" }) {
  const { settings } = useSettings();
  const cfg = settings.video_reviews || {};
  const hc = settings.home_copy || {};
  const videos = quotesOnly
    ? []
    : (cfg.items || []).filter((item) => item.enabled !== false && getReviewMedia(item.url || ""));
  const reviews = settings.testimonials || [];
  const [active, setActive] = useState(null);
  const [failed, setFailed] = useState(false);
  const showWall = cfg.enabled !== false && (videos.length > 0 || reviews.length > 0);
  const [wallRef, wallPaused] = useOffscreenPause("320px 0px", false, showWall);
  const columnCount = useIsMobile(901) ? 2 : 3;
  const media = active ? getReviewMedia(active.url) : null;
  const isVerticalModal =
    media?.kind === "video" || /youtube\.com\/shorts\//i.test(String(active?.url || ""));

  const videoRefCallback = useCallback((el) => {
    safePlayMedia(el, false);
  }, []);

  if (!showWall) return null;

  // Mix short videos and written quotes across the scrolling review columns
  const tiles = [];
  const max = Math.max(videos.length, reviews.length);
  for (let i = 0; i < max; i++) {
    if (videos[i]) tiles.push({ type: "video", item: videos[i] });
    if (reviews[i]) tiles.push({ type: "quote", item: reviews[i] });
    if (i === 0) tiles.push({ type: "stat" });
  }
  const indexes = tiles.map((_, index) => index);
  const columns = Array.from({ length: columnCount }, (_, column) => {
    const own = indexes.filter((index) => index % columnCount === column);
    return own.length >= 2 ? own : [...indexes.slice(column), ...indexes.slice(0, column)];
  });
  const open = (item) => {
    setFailed(false);
    setActive(item);
  };

  const inlineAutoplay = !wallPaused && !active;

  const render = (t, decorative, i) =>
    t.type === "video" ? (
      <VideoTile
        item={t.item}
        onOpen={open}
        decorative={decorative}
        shouldAutoplay={inlineAutoplay}
      />
    ) : t.type === "stat" ? (
      <StatTile value={hc.reviews_stat_value} label={hc.reviews_stat_label} />
    ) : (
      <QuoteTile item={t.item} accent={i % 3 === 1} />
    );

  return (
    <section className="home-band reviews-band" data-testid="client-reviews">
      <div className="container-xl">
        <div className="home-section-heading reviews-heading">
          <div>
            <div className="home-eyebrow">{hc.reviews_eyebrow || "Trader voices"}</div>
            <h2 className="font-display">
              {heading || hc.reviews_heading || cfg.heading || "Real Traders. Real Experiences."}
            </h2>
            <p>
              {hc.reviews_subtitle ||
                cfg.subtitle ||
                "Short trader video stories & verified reviews."}
            </p>
          </div>
        </div>
        <div
          ref={wallRef}
          className={`review-wall ${wallPaused || active ? "is-marquee-paused" : ""}`}
          data-testid="video-review-track"
        >
          {columns.map((list, column) => {
            const half = list.length >= 2 ? list : [...list, ...list];
            return (
              <div className={`review-col review-col-${column}`} key={column}>
                <div className="review-col-track">
                  {[0, 1].map((copy) =>
                    half.map((index, position) => {
                      const decorative =
                        copy > 0 || position >= list.length || index % columnCount !== column;
                      return (
                        <div
                          className="review-wall-item"
                          key={`${copy}-${position}`}
                          aria-hidden={decorative || undefined}
                        >
                          {render(tiles[index], decorative, position + column)}
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Dialog
        open={!!active}
        onOpenChange={(value) => {
          if (!value) setActive(null);
        }}
      >
        <DialogContent className={isVerticalModal ? "max-w-md" : "max-w-4xl"}>
          <DialogTitle>{active?.name || "Trader"}'s review</DialogTitle>
          <DialogDescription>{active?.role || "IndiFunded trading journey"}</DialogDescription>
          {media &&
            !failed &&
            (media.kind === "video" ? (
              <video
                ref={videoRefCallback}
                className={isVerticalModal ? "review-player-vertical" : "review-player"}
                src={media.url}
                controls
                autoPlay
                loop
                playsInline
                onError={() => setFailed(true)}
              />
            ) : (
              <iframe
                className={isVerticalModal ? "review-player-vertical" : "review-player"}
                src={media.url}
                title={`${active?.name}'s video review`}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ))}
          {failed && (
            <div role="alert" className="text-sm text-muted-foreground space-y-2 py-4">
              <p className="flex items-center gap-2">
                <Video size={16} /> This video is unavailable right now.
              </p>
              {String(media?.url || "").startsWith("/api/media/") && (
                <p className="text-xs text-[var(--muted-2)]">
                  The uploaded file was not found on this server. Re-upload it in Admin → Site
                  Settings → Review Videos or use a YouTube/Vimeo/HTTPS MP4 link.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
