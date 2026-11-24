import { useCallback, useState } from "react";
import { Play, Youtube, Video, Volume2 } from "lucide-react";
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

function TraderCard({ item, onOpen, decorative, shouldAutoplay }) {
  const media = getReviewMedia(item.url);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const previewVideoRef = useCallback((el) => {
    if (el) safePlayMedia(el, true);
  }, []);
  if (!media) return null;
  const thumb = getReviewThumbnail(media, item.poster);
  const previewUrl = getReviewPreviewUrl(media);
  const canAutoplayInline = shouldAutoplay && !videoFailed;
  const source = media.kind === "youtube" ? "YouTube" : media.kind === "vimeo" ? "Vimeo" : "Video";
  return (
    <article className="trader-card" aria-hidden={decorative || undefined}>
      <button
        type="button"
        className="trader-card-media group"
        onClick={() => onOpen(item)}
        tabIndex={decorative ? -1 : 0}
        aria-label={`Watch ${item.name || "trader"}'s story with sound`}
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
              title={`${item.name || "Trader"}'s story preview`}
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
          <span className="trader-card-fallback" aria-hidden="true">
            <Video />
          </span>
        )}
        <span className="trader-card-source">
          {media.kind === "youtube" ? <Youtube size={14} /> : <Video size={14} />}
          {source}
          {item.views ? ` • ${item.views}` : ""}
        </span>
        <span className="trader-card-sound">
          {canAutoplayInline ? <Volume2 size={13} /> : <Play size={13} />}
          {canAutoplayInline ? "Tap for sound" : "Watch story"}
        </span>
      </button>
      <div className="trader-card-body">
        <h3 className="font-display">
          {item.flag ? <span aria-hidden="true">{item.flag} </span> : null}
          {item.name || "IndiFunded trader"}
        </h3>
        <p>{item.country || item.role || "India"}</p>
        <dl>
          <div>
            <dt>Rewards earned</dt>
            <dd>{item.rewards || "—"}</dd>
          </div>
          <div>
            <dt>Trading style</dt>
            <dd>{item.style || item.label || "—"}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

/** FTMO-style horizontal auto-scrolling trader video cards. Content comes from Admin → Site Settings → Review Videos. */
export default function OurTraders({ showEmpty = false, heading = "", subtitle = "" }) {
  const { settings } = useSettings();
  const cfg = settings.video_reviews || {};
  const videosVisible = cfg.enabled !== false && settings.home_sections?.trader_videos !== false;
  const items = (cfg.items || []).filter(
    (item) => item.enabled !== false && getReviewMedia(item.url || ""),
  );
  const [active, setActive] = useState(null);
  const [marqueeRef, marqueePaused] = useOffscreenPause(
    "320px 0px",
    false,
    videosVisible && items.length > 0,
  );
  const media = active ? getReviewMedia(active.url) : null;
  const videoRefCallback = useCallback((el) => {
    safePlayMedia(el, false);
  }, []);

  if (!videosVisible) return null;
  if (!items.length && !showEmpty) return null;
  const reps = Math.max(1, Math.min(2, Math.ceil(4 / Math.max(items.length, 1))));
  const half = Array.from({ length: reps }, () => items).flat();
  const loop = [...half, ...half];
  const inlineAutoplay = !marqueePaused && !active;

  return (
    <section className="home-band our-traders-band" data-testid="our-traders">
      <div className="container-xl">
        <div className="home-section-heading">
          <div>
            <div className="home-eyebrow">Our traders</div>
            <h2 className="font-display">{heading || "Real traders. Real stories."}</h2>
            <p>
              {subtitle ||
                "Hear directly from IndiFunded traders about their journey, style and rewards."}
            </p>
          </div>
        </div>
      </div>
      {items.length ? (
        <div
          ref={marqueeRef}
          className={`trader-marquee-wrap ${marqueePaused || active ? "is-marquee-paused" : ""}`}
        >
          <div
            className="trader-marquee"
            style={{ animationDuration: `${Math.max(28, half.length * 7)}s` }}
          >
            {loop.map((item, i) => (
              <TraderCard
                key={i}
                item={item}
                onOpen={setActive}
                decorative={i >= items.length}
                shouldAutoplay={inlineAutoplay}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="container-xl">
          <div className="card-panel p-10 text-center text-[var(--muted)]">
            Trader video stories are coming soon.
          </div>
        </div>
      )}
      <Dialog
        open={!!active}
        onOpenChange={(v) => {
          if (!v) setActive(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogTitle>{active?.name || "Trader"}'s story</DialogTitle>
          <DialogDescription>
            {[active?.country, active?.style].filter(Boolean).join(" · ") ||
              "IndiFunded trading journey"}
          </DialogDescription>
          {media &&
            (media.kind === "video" ? (
              <video
                ref={videoRefCallback}
                className="review-player"
                src={media.url}
                controls
                autoPlay
                loop
                playsInline
              />
            ) : (
              <iframe
                className="review-player"
                src={media.url}
                title={`${active?.name || "Trader"} video`}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}
