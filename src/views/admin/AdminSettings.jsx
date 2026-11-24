import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { api, formatApiError } from "../../lib/api";
import {
  fetchPublicSiteConfigFromFirestore,
  isFirebaseAdminUser,
  savePublicSiteConfigToFirestore,
  syncCollectionsToFirestore,
} from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { getReviewMedia } from "../../lib/review-media";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useSettings, DEFAULT_SETTINGS, mergeSettings } from "../../context/SettingsContext";
import { CHART_SPEED_PRESETS, clampTickIntervalMs } from "../../lib/live-feed-config";
import { computeLast3DigitTick, formatPrice } from "../../lib/useLiveMarket";
import { QRCodeSVG } from "qrcode.react";
import { utrLast4 } from "../../lib/trust";
import {
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Megaphone,
  User,
  Mail,
  Home as HomeIcon,
  ListChecks,
  MessageSquare,
  HelpCircle,
  BookOpen,
  Info,
  ShieldCheck,
  Target,
  Sparkles,
  Upload,
  Video,
  Cloud,
  CloudUpload,
  Activity,
  SlidersHorizontal,
  Zap,
} from "lucide-react";

const inputCls = "bg-[var(--bg-1)] border-[var(--border-hi)] mt-2";

export default function AdminSettings() {
  const { settings, reload } = useSettings();
  const { loginWithGoogle } = useAuth();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [cloudReady, setCloudReady] = useState(() => isFirebaseAdminUser());

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.get("/settings", { params: { _refresh: Date.now() } }).catch(() => null),
      fetchPublicSiteConfigFromFirestore().catch(() => null),
    ]).then(([response, cloudConfig]) => {
      if (!mounted) return;
      let combined = response?.data || settings || {};
      if (cloudConfig && typeof cloudConfig === "object") {
        const { id: _cid, updatedAt: _uAt, ...cloudFields } = cloudConfig;
        combined = response?.headers?.["x-settings-saved"] === "false"
          ? mergeSettings(combined, cloudFields)
          : mergeSettings(cloudFields, combined);
      }
      setS(deepClone(mergeSettings(DEFAULT_SETTINGS, combined)));
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!s) return <div className="text-[var(--muted)]">Loading…</div>;

  const set = (path, value) => setS((prev) => setDeep(prev, path, value));
  const save = async () => {
    if (
      (s.video_reviews?.items || []).some(
        (item) => item.enabled !== false && !getReviewMedia(item.url || ""),
      )
    ) {
      toast.error("Each enabled review needs a valid HTTPS MP4, WebM, YouTube or Vimeo link.");
      return;
    }
    setSaving(true);
    try {
      const response = await api.put("/settings", s);
      const savedData = response.data || s;
      if (isFirebaseAdminUser()) {
        await savePublicSiteConfigToFirestore(savedData);
        setCloudReady(true);
      }
      setS(deepClone(mergeSettings(DEFAULT_SETTINGS, savedData)));
      toast.success(
        isFirebaseAdminUser()
          ? "Settings saved to Cloud Firestore & synced live"
          : "Settings saved & synced live",
      );
      await reload(true);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };
  const enableCloudSync = async () => {
    try {
      await loginWithGoogle();
      setCloudReady(isFirebaseAdminUser());
      if (isFirebaseAdminUser()) {
        await savePublicSiteConfigToFirestore(s);
        toast.success("Google Cloud Sync connected & current settings backed up");
      } else {
        toast.info("Signed in with Google. Use your admin Google email to write cloud settings.");
      }
    } catch (err) {
      toast.error(err?.message || "Could not connect Google Cloud Sync");
    }
  };
  const syncFullDatabase = async () => {
    setSaving(true);
    try {
      const { data } = await api.get("/admin/database/export");
      const res = await syncCollectionsToFirestore(data?.collections || {}, s);
      toast.success(`Synced ${res.syncedCount} database records to your Google Cloud Firestore`);
    } catch (err) {
      toast.error(
        formatApiError(err?.response?.data?.detail, err?.message || "Full DB sync failed"),
      );
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
    setS(deepClone(DEFAULT_SETTINGS));
    setConfirmReset(false);
    toast.info("Defaults restored in editor — click Save changes to publish.");
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-10 flex-wrap gap-3">
        <div>
          <div className="chip mb-3">CMS</div>
          <h1 className="font-display text-4xl">Site Settings</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {cloudReady ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                <Cloud size={14} /> Cloud Sync Ready
              </span>
              <button
                type="button"
                onClick={syncFullDatabase}
                disabled={saving}
                className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-2 border-[var(--border-hi)] text-[var(--muted)] hover:text-white disabled:opacity-50"
                data-testid="settings-sync-full-db"
              >
                <CloudUpload size={14} className="text-[var(--accent)]" /> Sync Full DB
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={enableCloudSync}
              className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-2 border-[var(--border-hi)] text-[var(--muted)] hover:text-white"
            >
              <Cloud size={14} className="text-[var(--accent)]" /> Connect Google Cloud Sync
            </button>
          )}
          <Link
            to="/admin/ai-editor"
            className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-2 border-[var(--accent)]/40 text-white"
          >
            <Sparkles size={14} className="text-[var(--accent)]" /> Edit with AI
          </Link>
          {confirmReset ? (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={reset}
                className="px-3.5 py-2 rounded-full text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="btn-ghost rounded-full px-3 py-2 text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-2"
            >
              <RotateCcw size={14} /> Reset defaults
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="btn-amber rounded-full px-5 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-60"
            data-testid="settings-save"
          >
            <Save size={14} /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="glass p-1 h-auto flex flex-wrap gap-1 rounded-2xl mb-8">
          <T v="general" icon={<User size={14} />}>
            General
          </T>
          <T v="contact" icon={<Mail size={14} />}>
            Contact & Social
          </T>
          <T v="announce" icon={<Megaphone size={14} />}>
            Announcement
          </T>
          <T v="widgets" icon={<HomeIcon size={14} />}>
            Widgets
          </T>
          <T v="hero" icon={<HomeIcon size={14} />}>
            Hero
          </T>
          <T v="ratings" icon={<HomeIcon size={14} />}>
            Ratings
          </T>
          <T v="steps" icon={<ListChecks size={14} />}>
            Steps &amp; How It Works
          </T>
          <T v="counter" icon={<HomeIcon size={14} />}>
            Live Counter
          </T>
          <T v="benefits" icon={<HomeIcon size={14} />}>
            Benefits
          </T>
          <T v="payouts" icon={<HomeIcon size={14} />}>
            Payouts
          </T>
          <T v="homepage" icon={<HomeIcon size={14} />}>
            Homepage
          </T>
          <T v="eval_risk" icon={<Target size={14} />}>
            Evaluation &amp; Risk
          </T>
          <T v="trust" icon={<ShieldCheck size={14} />}>
            Trust
          </T>
          <T v="videos" icon={<MessageSquare size={14} />}>
            Review Videos
          </T>
          <T v="testi" icon={<MessageSquare size={14} />}>
            Testimonials
          </T>
          <T v="faq" icon={<HelpCircle size={14} />}>
            FAQ
          </T>
          <T v="rules" icon={<BookOpen size={14} />}>
            Rules
          </T>
          <T v="about" icon={<Info size={14} />}>
            About
          </T>
        </TabsList>

        <TabsContent value="general">
          <Section title="Brand">
            <Grid2>
              <F label="Brand Name">
                <Input
                  value={s.brand.name}
                  onChange={(e) => set("brand.name", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Logo URL">
                <Input
                  value={s.brand.logo_url}
                  onChange={(e) => set("brand.logo_url", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <F label="Tagline">
              <Textarea
                rows={2}
                value={s.brand.tagline}
                onChange={(e) => set("brand.tagline", e.target.value)}
                className={inputCls}
              />
            </F>
          </Section>
        </TabsContent>

        <TabsContent value="contact">
          <div className="card-panel p-5 mb-6 flex flex-wrap items-center justify-between gap-4 border border-[var(--accent)]/30 bg-[var(--accent)]/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] grid place-items-center">
                <Mail size={18} />
              </div>
              <div>
                <div className="font-medium text-sm text-white">
                  Automate Business Gmail Welcome Emails
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Connect your Gmail App Password to send welcome emails automatically on signup and
                  login.
                </div>
              </div>
            </div>
            <Link to="/admin/email" className="btn-amber rounded-full px-4 py-2 text-xs">
              Configure Business Gmail →
            </Link>
          </div>
          <Section title="Contact Info">
            <Grid2>
              <F label="Email">
                <Input
                  value={s.contact.email}
                  onChange={(e) => set("contact.email", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Phone">
                <Input
                  value={s.contact.phone}
                  onChange={(e) => set("contact.phone", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="WhatsApp Number">
                <Input
                  value={s.contact.whatsapp}
                  onChange={(e) => set("contact.whatsapp", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="UPI ID (payments)">
                <Input
                  value={s.contact.upi_id}
                  onChange={(e) => set("contact.upi_id", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Company Legal Name">
                <Input
                  value={s.contact.company}
                  onChange={(e) => set("contact.company", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <F label="Office info (contact page)">
              <Textarea
                rows={2}
                value={s.contact.office}
                onChange={(e) => set("contact.office", e.target.value)}
                className={inputCls}
              />
            </F>
          </Section>
          <Section title="Social Links">
            <Grid2>
              <F label="Instagram URL">
                <Input
                  value={s.social.instagram}
                  onChange={(e) => set("social.instagram", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="YouTube URL">
                <Input
                  value={s.social.youtube}
                  onChange={(e) => set("social.youtube", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Twitter / X URL">
                <Input
                  value={s.social.twitter}
                  onChange={(e) => set("social.twitter", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Facebook URL">
                <Input
                  value={s.social.facebook}
                  onChange={(e) => set("social.facebook", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="WhatsApp Link (wa.me/...)">
                <Input
                  value={s.social.whatsapp_link}
                  onChange={(e) => set("social.whatsapp_link", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
          </Section>
        </TabsContent>

        <TabsContent value="announce">
          <Section title="Announcement Bar (top of site)">
            <label className="flex items-center gap-2 text-sm mb-4">
              <input
                type="checkbox"
                checked={!!s.announcement.enabled}
                onChange={(e) => set("announcement.enabled", e.target.checked)}
              />
              <span>Show announcement bar</span>
            </label>
            <F label="Message">
              <Input
                value={s.announcement.text}
                onChange={(e) => set("announcement.text", e.target.value)}
                className={inputCls}
                placeholder="🎉 30% OFF — limited time"
              />
            </F>
            <Grid2>
              <F label="CTA Link (path or URL)">
                <Input
                  value={s.announcement.link}
                  onChange={(e) => set("announcement.link", e.target.value)}
                  className={inputCls}
                  placeholder="/challenges"
                />
              </F>
              <F label="CTA Label">
                <Input
                  value={s.announcement.cta}
                  onChange={(e) => set("announcement.cta", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
          </Section>
        </TabsContent>

        <TabsContent value="widgets">
          <Section title="Widgets on the site">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.widgets?.scroll_progress?.enabled ?? true}
                onChange={(e) => set("widgets.scroll_progress.enabled", e.target.checked)}
              />
              <span>Scroll progress bar (top of page)</span>
            </label>
            <label className="flex items-center gap-2 text-sm mt-3">
              <input
                type="checkbox"
                checked={s.widgets?.bg_3d?.enabled ?? true}
                onChange={(e) => set("widgets.bg_3d.enabled", e.target.checked)}
              />
              <span>3D animated background (orbs + blob + mouse glow)</span>
            </label>
          </Section>

          <ChartSpeedControlSection s={s} set={set} />

          <Section title="Website Interactive Effects (Cursor Glow, 3D Tilt & Kinetic Motion)">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="flex items-start gap-2.5 text-sm p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-1)]/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={s.widgets?.fx?.cursor_glow ?? true}
                  onChange={(e) => set("widgets.fx.cursor_glow", e.target.checked)}
                  data-testid="fx-cursor-glow"
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-[var(--text)]">Cursor Glow Spotlight</strong>
                  <span className="text-xs text-[var(--muted)]">
                    Emerald & amber pointer glow across cards and borders
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-sm p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-1)]/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={s.widgets?.fx?.tilt_3d ?? true}
                  onChange={(e) => set("widgets.fx.tilt_3d", e.target.checked)}
                  data-testid="fx-tilt-3d"
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-[var(--text)]">3D Card Tilt</strong>
                  <span className="text-xs text-[var(--muted)]">
                    Smooth GPU perspective tilt on pointer hover
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-sm p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-1)]/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={s.widgets?.fx?.kinetic_motion ?? true}
                  onChange={(e) => set("widgets.fx.kinetic_motion", e.target.checked)}
                  data-testid="fx-kinetic-motion"
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-[var(--text)]">Kinetic CTA & Reveals</strong>
                  <span className="text-xs text-[var(--muted)]">
                    Light sweeps, parallax scroll layers & staggered reveals
                  </span>
                </span>
              </label>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="hero">
          <Section title="Hero Section">
            <Grid2>
              <F label="Chip Text">
                <Input
                  value={s.hero.chip}
                  onChange={(e) => set("hero.chip", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Hero Brand Watermark">
                <Input
                  value={s.hero.brand_name ?? "IndiFunded"}
                  onChange={(e) => set("hero.brand_name", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <Grid2>
              <F label="Title (before highlight)">
                <Input
                  value={s.hero.title_before}
                  onChange={(e) => set("hero.title_before", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Highlight Text">
                <Input
                  value={s.hero.title_highlight}
                  onChange={(e) => set("hero.title_highlight", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <F label="Title (after highlight)">
              <Input
                value={s.hero.title_after}
                onChange={(e) => set("hero.title_after", e.target.value)}
                className={inputCls}
              />
            </F>
            <F label="Subtitle">
              <Textarea
                rows={3}
                value={s.hero.subtitle}
                onChange={(e) => set("hero.subtitle", e.target.value)}
                className={inputCls}
              />
            </F>
            <Grid2>
              <F label="Primary CTA label">
                <Input
                  value={s.hero.cta_primary}
                  onChange={(e) => set("hero.cta_primary", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Secondary CTA label">
                <Input
                  value={s.hero.cta_secondary}
                  onChange={(e) => set("hero.cta_secondary", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <div className="grid md:grid-cols-3 gap-4 pt-2">
              {[0, 1, 2].map((idx) => (
                <F key={idx} label={`Hero Assurance Pill #${idx + 1}`}>
                  <Input
                    value={s.hero.assurances?.[idx] ?? ""}
                    onChange={(e) => {
                      const next = [
                        ...(s.hero.assurances || [
                          "Clear challenge rules",
                          "One-time fee",
                          "Trader support",
                        ]),
                      ];
                      next[idx] = e.target.value;
                      set("hero.assurances", next);
                    }}
                    className={inputCls}
                  />
                </F>
              ))}
            </div>
          </Section>
          <Section title="Stat Strip (4 items)">
            <ListEditor
              items={s.hero.stats}
              onChange={(arr) => set("hero.stats", arr)}
              empty={{ k: "", v: "" }}
              render={(it, upd) => (
                <Grid2>
                  <F label="Number / Label">
                    <Input
                      value={it.k}
                      onChange={(e) => upd({ ...it, k: e.target.value })}
                      className={inputCls}
                      placeholder="75%"
                    />
                  </F>
                  <F label="Caption">
                    <Input
                      value={it.v}
                      onChange={(e) => upd({ ...it, v: e.target.value })}
                      className={inputCls}
                      placeholder="Profit Split"
                    />
                  </F>
                </Grid2>
              )}
            />
          </Section>
        </TabsContent>

        <TabsContent value="ratings">
          <Section title="Review-Platform Ratings (Trustpilot, PropFirmMatch, etc.)">
            <label className="flex items-center gap-2 text-sm mb-4">
              <input
                type="checkbox"
                checked={s.ratings?.enabled ?? true}
                onChange={(e) => set("ratings.enabled", e.target.checked)}
              />
              <span>Show ratings strip on Home</span>
            </label>
            <Grid2>
              <F label="Section heading">
                <Input
                  value={s.ratings?.heading || ""}
                  onChange={(e) => set("ratings.heading", e.target.value)}
                  className={inputCls}
                  placeholder="Rated by traders"
                />
              </F>
              <F label="Section subtitle">
                <Input
                  value={s.ratings?.subtitle || ""}
                  onChange={(e) => set("ratings.subtitle", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider mt-6 mb-3">
              Rating cards
            </div>
            <ListEditor
              items={s.ratings?.items || []}
              onChange={(arr) => set("ratings.items", arr)}
              empty={{
                platform: "",
                rating: 4.5,
                out_of: 5,
                reviews: 0,
                color: "#29d39a",
                url: "",
              }}
              addLabel="Add rating platform"
              render={(it, upd) => (
                <>
                  <Grid2>
                    <F label="Platform (e.g. Trustpilot)">
                      <Input
                        value={it.platform}
                        onChange={(e) => upd({ ...it, platform: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Link URL">
                      <Input
                        value={it.url || ""}
                        onChange={(e) => upd({ ...it, url: e.target.value })}
                        className={inputCls}
                        placeholder="https://..."
                      />
                    </F>
                  </Grid2>
                  <Grid2>
                    <F label="Rating (e.g. 4.3)">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        value={it.rating}
                        onChange={(e) => upd({ ...it, rating: Number(e.target.value) || 0 })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Out of (e.g. 5)">
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="10"
                        value={it.out_of}
                        onChange={(e) => upd({ ...it, out_of: Number(e.target.value) || 5 })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <Grid2>
                    <F label="Number of Reviews">
                      <Input
                        type="number"
                        value={it.reviews}
                        onChange={(e) => upd({ ...it, reviews: Number(e.target.value) || 0 })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Brand Color (hex)">
                      <Input
                        value={it.color || ""}
                        onChange={(e) => upd({ ...it, color: e.target.value })}
                        className={inputCls}
                        placeholder="#00b67a"
                      />
                    </F>
                  </Grid2>
                </>
              )}
            />
          </Section>
        </TabsContent>

        <TabsContent value="steps">
          <Section title="Homepage 3 Steps section">
            <Grid2>
              <F label="Eyebrow">
                <Input
                  value={s.steps.eyebrow || ""}
                  onChange={(e) => set("steps.eyebrow", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Button Label">
                <Input
                  value={s.steps.cta_label || ""}
                  onChange={(e) => set("steps.cta_label", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Title prefix">
                <Input
                  value={s.steps.title_prefix}
                  onChange={(e) => set("steps.title_prefix", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Title suffix (brand)">
                <Input
                  value={s.steps.title_suffix}
                  onChange={(e) => set("steps.title_suffix", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <F label="Subtitle">
              <Input
                value={s.steps.subtitle || ""}
                onChange={(e) => set("steps.subtitle", e.target.value)}
                className={inputCls}
              />
            </F>
            <ListEditor
              items={s.steps.items}
              onChange={(arr) => set("steps.items", arr)}
              empty={{ n: "", t: "", d: "" }}
              render={(it, upd) => (
                <>
                  <Grid2>
                    <F label="Step Number">
                      <Input
                        value={it.n}
                        onChange={(e) => upd({ ...it, n: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Title">
                      <Input
                        value={it.t}
                        onChange={(e) => upd({ ...it, t: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <F label="Description">
                    <Textarea
                      rows={2}
                      value={it.d}
                      onChange={(e) => upd({ ...it, d: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                </>
              )}
            />
          </Section>

          <Section title="How It Works Page & Challenge Process (/how-it-works)">
            <label className="flex items-center gap-2 text-sm mb-2">
              <input
                type="checkbox"
                checked={s.how_it_works?.enabled !== false}
                onChange={(e) => set("how_it_works.enabled", e.target.checked)}
              />
              <span>Show How It Works timeline block</span>
            </label>
            <Grid2>
              <F label="Page Chip">
                <Input
                  value={s.how_it_works?.chip || ""}
                  onChange={(e) => set("how_it_works.chip", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Section Chip">
                <Input
                  value={s.how_it_works?.section_chip || ""}
                  onChange={(e) => set("how_it_works.section_chip", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Page H1 Title">
                <Input
                  value={s.how_it_works?.title || ""}
                  onChange={(e) => set("how_it_works.title", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Section Heading">
                <Input
                  value={s.how_it_works?.section_title || ""}
                  onChange={(e) => set("how_it_works.section_title", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Primary CTA Label">
                <Input
                  value={s.how_it_works?.cta_primary || ""}
                  onChange={(e) => set("how_it_works.cta_primary", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Secondary CTA Label">
                <Input
                  value={s.how_it_works?.cta_secondary || ""}
                  onChange={(e) => set("how_it_works.cta_secondary", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <F label="Page Subtitle">
              <Textarea
                rows={2}
                value={s.how_it_works?.subtitle || ""}
                onChange={(e) => set("how_it_works.subtitle", e.target.value)}
                className={inputCls}
              />
            </F>
            <F label="Section Subtitle">
              <Input
                value={s.how_it_works?.section_subtitle || ""}
                onChange={(e) => set("how_it_works.section_subtitle", e.target.value)}
                className={inputCls}
              />
            </F>
            <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider mt-6 mb-3">
              4 Step Cards
            </div>
            <ListEditor
              items={s.how_it_works?.items || []}
              onChange={(arr) => set("how_it_works.items", arr)}
              empty={{ t: "", d: "", i: "ShoppingCart" }}
              addLabel="Add step"
              render={(it, upd) => (
                <>
                  <Grid2>
                    <F label="Step Title">
                      <Input
                        value={it.t || ""}
                        onChange={(e) => upd({ ...it, t: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Icon (ShoppingCart / Target / TrendingUp / Wallet)">
                      <Input
                        value={it.i || ""}
                        onChange={(e) => upd({ ...it, i: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <F label="Step Description">
                    <Textarea
                      rows={2}
                      value={it.d || ""}
                      onChange={(e) => upd({ ...it, d: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                </>
              )}
            />
            <F label="Process Box Heading">
              <Input
                value={s.how_it_works?.process_heading || ""}
                onChange={(e) => set("how_it_works.process_heading", e.target.value)}
                className={inputCls}
                data-testid="admin-hiw-process-heading"
              />
            </F>
            <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider mt-4 mb-2">
              Process Paragraphs
            </div>
            <ListEditor
              items={s.how_it_works?.process_paragraphs || []}
              onChange={(arr) => set("how_it_works.process_paragraphs", arr)}
              empty=""
              addLabel="Add paragraph"
              render={(it, upd, idx) => (
                <F label={`Paragraph #${idx + 1}`}>
                  <Textarea
                    rows={2}
                    value={typeof it === "string" ? it : ""}
                    onChange={(e) => upd(e.target.value)}
                    className={inputCls}
                  />
                </F>
              )}
            />
          </Section>
        </TabsContent>

        <TabsContent value="counter">
          <Section title="Live Counter (Trusted by India's growing trader community)">
            <label className="flex items-center gap-2 text-sm mb-4">
              <input
                type="checkbox"
                checked={s.live_counter?.enabled ?? true}
                onChange={(e) => set("live_counter.enabled", e.target.checked)}
              />
              <span>Show this section on Home</span>
            </label>
            <F label="Heading">
              <Input
                value={s.live_counter?.heading || ""}
                onChange={(e) => set("live_counter.heading", e.target.value)}
                className={inputCls}
              />
            </F>
            <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider mt-6 mb-3">
              Numbers (4 items)
            </div>
            <ListEditor
              items={s.live_counter?.items || []}
              onChange={(arr) => set("live_counter.items", arr)}
              empty={{ label: "", value: 0, prefix: "", suffix: "" }}
              addLabel="Add number"
              render={(it, upd) => (
                <>
                  <Grid2>
                    <F label="Label (e.g. Traders Funded)">
                      <Input
                        value={it.label}
                        onChange={(e) => upd({ ...it, label: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Value (number, no commas)">
                      <Input
                        type="number"
                        value={it.value}
                        onChange={(e) => upd({ ...it, value: Number(e.target.value) || 0 })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <Grid2>
                    <F label="Prefix (e.g. ₹)">
                      <Input
                        value={it.prefix || ""}
                        onChange={(e) => upd({ ...it, prefix: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Suffix (e.g. + or %)">
                      <Input
                        value={it.suffix || ""}
                        onChange={(e) => upd({ ...it, suffix: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                </>
              )}
            />
          </Section>
        </TabsContent>

        <TabsContent value="benefits">
          <Section title="Benefits (shown on Rules page)">
            <Grid2>
              <F label="Section title">
                <Input
                  value={s.benefits?.title || ""}
                  onChange={(e) => set("benefits.title", e.target.value)}
                  className={inputCls}
                  placeholder="Why IndiFunded"
                />
              </F>
              <F label="Subtitle">
                <Input
                  value={s.benefits?.subtitle || ""}
                  onChange={(e) => set("benefits.subtitle", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider mt-6 mb-3">
              Benefit cards
            </div>
            <ListEditor
              items={s.benefits?.items || []}
              onChange={(arr) => set("benefits.items", arr)}
              empty={{ t: "", d: "", i: "CheckCircle2" }}
              addLabel="Add benefit"
              render={(it, upd) => (
                <>
                  <Grid2>
                    <F label="Title">
                      <Input
                        value={it.t}
                        onChange={(e) => upd({ ...it, t: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Icon (Clock/CircleDollarSign/ShieldCheck/Zap/Star/TrendingUp/CheckCircle2)">
                      <Input
                        value={it.i}
                        onChange={(e) => upd({ ...it, i: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <F label="Description">
                    <Textarea
                      rows={2}
                      value={it.d}
                      onChange={(e) => upd({ ...it, d: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                </>
              )}
            />
          </Section>
          <Section title="Homepage Why IndiFunded Cards (2-Column Mobile Grid)">
            <Grid2>
              <F label="Eyebrow">
                <Input
                  value={s.why_choose?.eyebrow || ""}
                  onChange={(e) => set("why_choose.eyebrow", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Section Heading">
                <Input
                  value={s.why_choose?.heading || ""}
                  onChange={(e) => set("why_choose.heading", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <ListEditor
              items={s.why_choose?.items || []}
              onChange={(arr) => set("why_choose.items", arr)}
              empty={{ t: "", d: "", icon: "ShieldCheck" }}
              addLabel="Add Why IndiFunded card"
              render={(it, upd) => (
                <>
                  <Grid2>
                    <F label="Title">
                      <Input
                        value={it.t || ""}
                        onChange={(e) => upd({ ...it, t: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Icon (Scale/Wallet/Sparkles/ShieldCheck/LineChart/Headphones)">
                      <Input
                        value={it.icon || ""}
                        onChange={(e) => upd({ ...it, icon: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <F label="Description">
                    <Textarea
                      rows={2}
                      value={it.d || ""}
                      onChange={(e) => upd({ ...it, d: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                </>
              )}
            />
          </Section>
        </TabsContent>

        <TabsContent value="payouts">
          <Section title="Payouts Page (/payouts)">
            <p className="text-xs text-[var(--muted)] mb-2">
              The /payouts page displays the Payout Request form (recent payouts feed has been
              removed from /payouts).
            </p>
            <label className="flex items-center gap-2 text-sm mb-4">
              <input
                type="checkbox"
                checked={s.payouts_page?.show_request_form !== false}
                onChange={(e) => set("payouts_page.show_request_form", e.target.checked)}
              />
              <span>Show Payout Request form on /payouts</span>
            </label>
            <Grid2>
              <F label="Heading">
                <Input
                  value={s.payouts_page?.heading || ""}
                  onChange={(e) => set("payouts_page.heading", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Subtitle">
                <Input
                  value={s.payouts_page?.subtitle || ""}
                  onChange={(e) => set("payouts_page.subtitle", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider mt-6 mb-3">
              Payout entries
            </div>
            <ListEditor
              items={s.payouts_page?.items || []}
              onChange={(arr) => set("payouts_page.items", arr)}
              empty={{ name: "", plan: "Standard", amount: 0, city: "", days_ago: 1 }}
              addLabel="Add payout"
              render={(it, upd) => (
                <>
                  <Grid2>
                    <F label="Trader Name">
                      <Input
                        value={it.name}
                        onChange={(e) => upd({ ...it, name: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Plan (Starter/Standard/Pro)">
                      <Input
                        value={it.plan}
                        onChange={(e) => upd({ ...it, plan: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <Grid2>
                    <F label="Amount (₹, keep between 5,000 and 55,000)">
                      <Input
                        type="number"
                        min="5000"
                        max="55000"
                        value={it.amount}
                        onChange={(e) => upd({ ...it, amount: Number(e.target.value) || 0 })}
                        className={inputCls}
                      />
                    </F>
                    <F label="City">
                      <Input
                        value={it.city}
                        onChange={(e) => upd({ ...it, city: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <F label="Days Ago">
                    <Input
                      type="number"
                      value={it.days_ago}
                      onChange={(e) => upd({ ...it, days_ago: Number(e.target.value) || 0 })}
                      className={inputCls}
                    />
                  </F>
                </>
              )}
            />
          </Section>
        </TabsContent>

        <TabsContent value="homepage">
          <Section title="Homepage & public visibility sections">
            <div className="grid sm:grid-cols-2 gap-4">
              {Object.entries({
                plans: "Challenge plans",
                payouts: "Latest & weekly payouts",
                trader_videos: "Trader Videos (Home & Our Traders)",
                success_stories: "Success Stories (Home, Trust & /stories)",
                trust: "Trust & Transparency",
                reviews: "Client reviews",
                steps: "How it works",
                benefits: "Trading experience",
                calculator: "Profit calculator",
                community: "Community",
                blogs: "Latest articles",
                faq: "Frequently asked questions",
                support: "Support",
              }).map(([key, label]) => (
                <label key={key} className="flex gap-3 items-center">
                  <input
                    type="checkbox"
                    checked={s.home_sections?.[key] !== false}
                    onChange={(e) => set(`home_sections.${key}`, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Section>
          <Section title="Homepage Section Copy, Headings & CTAs (Every Text)">
            <Grid2>
              {[
                ["platform_eyebrow", "Platform Preview Eyebrow"],
                ["platform_heading", "Platform Preview Heading"],
                ["platform_cta", "Platform Preview CTA"],
                ["latest_payouts_eyebrow", "Latest Payouts Eyebrow"],
                ["latest_payouts_heading", "Latest Payouts Heading"],
                ["latest_payouts_subtitle", "Latest Payouts Subtitle"],
                ["latest_payouts_cta", "Latest Payouts CTA"],
                ["weekly_chip", "Weekly Winners Chip"],
                ["weekly_heading", "Weekly Winners Heading"],
                ["weekly_badge", "Weekly Winners Card Badge"],
                ["leaderboard_eyebrow_prefix", "Leaderboard Eyebrow Prefix"],
                ["leaderboard_heading", "Leaderboard Heading"],
                ["leaderboard_subtitle", "Leaderboard Subtitle"],
                ["leaderboard_cta", "Leaderboard CTA"],
                ["reviews_eyebrow", "Reviews Eyebrow"],
                ["reviews_heading", "Reviews Heading"],
                ["reviews_subtitle", "Reviews Subtitle"],
                ["reviews_stat_value", "Reviews Stat Tile Value"],
                ["reviews_stat_label", "Reviews Stat Tile Label"],
                ["faq_eyebrow", "FAQ Eyebrow"],
                ["faq_heading_line1", "FAQ Heading Line 1"],
                ["faq_heading_line2", "FAQ Heading Line 2"],
                ["faq_cta", "FAQ CTA"],
                ["closing_eyebrow", "Closing Banner Eyebrow"],
                ["closing_title_prefix", "Closing Title Prefix"],
                ["closing_title_highlight", "Closing Title Highlight"],
                ["closing_title_suffix", "Closing Title Suffix"],
                ["closing_cta", "Closing Banner CTA"],
              ].map(([k, lbl]) => (
                <F key={k} label={lbl}>
                  <Input
                    value={s.home_copy?.[k] || ""}
                    onChange={(e) => set(`home_copy.${k}`, e.target.value)}
                    className={inputCls}
                  />
                </F>
              ))}
            </Grid2>
            <F label="Platform Preview Subtitle">
              <Textarea
                rows={2}
                value={s.home_copy?.platform_subtitle || ""}
                onChange={(e) => set("home_copy.platform_subtitle", e.target.value)}
                className={inputCls}
              />
            </F>
            <F label="Weekly Winners Subtitle">
              <Textarea
                rows={2}
                value={s.home_copy?.weekly_subtitle || ""}
                onChange={(e) => set("home_copy.weekly_subtitle", e.target.value)}
                className={inputCls}
              />
            </F>
            <F label="Closing Banner Subtitle">
              <Input
                value={s.home_copy?.closing_subtitle || ""}
                onChange={(e) => set("home_copy.closing_subtitle", e.target.value)}
                className={inputCls}
              />
            </F>
          </Section>
        </TabsContent>
        <TabsContent value="eval_risk">
          <Section title="Global Evaluation Progress & Risk Management (Applies to ALL User Accounts)">
            <p className="text-sm text-[var(--muted)]">
              Changes saved here automatically update every user's Evaluation Progress targets, Risk
              Management limits, Trading Terminal order guardrails, and Trading Calculator defaults.
            </p>
            <Grid2>
              <F label="Profit Target (%)">
                <Input
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  value={s.evaluation_risk?.profit_target_pct ?? 8}
                  onChange={(e) =>
                    set("evaluation_risk.profit_target_pct", Number(e.target.value) || 8)
                  }
                  className={inputCls}
                  data-testid="admin-eval-target-pct"
                />
              </F>
              <F label="Max Overall Drawdown / Loss Limit (%)">
                <Input
                  type="number"
                  min="1"
                  max="50"
                  step="0.5"
                  value={s.evaluation_risk?.max_loss_limit ?? 20}
                  onChange={(e) =>
                    set("evaluation_risk.max_loss_limit", Number(e.target.value) || 20)
                  }
                  className={inputCls}
                  data-testid="admin-eval-max-loss"
                />
              </F>
              <F label="Daily Loss Limit (%)">
                <Input
                  type="number"
                  min="0.5"
                  max="25"
                  step="0.5"
                  value={s.evaluation_risk?.daily_loss_limit_pct ?? 5}
                  onChange={(e) =>
                    set("evaluation_risk.daily_loss_limit_pct", Number(e.target.value) || 5)
                  }
                  className={inputCls}
                  data-testid="admin-eval-daily-loss"
                />
              </F>
              <F label="Max Trades Per Day">
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={s.evaluation_risk?.trades_per_day ?? 5}
                  onChange={(e) =>
                    set("evaluation_risk.trades_per_day", Number(e.target.value) || 5)
                  }
                  className={inputCls}
                  data-testid="admin-eval-trades-day"
                />
              </F>
              <F label="Minimum Trading Days Required">
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={s.evaluation_risk?.min_trading_days ?? 10}
                  onChange={(e) =>
                    set("evaluation_risk.min_trading_days", Number(e.target.value) || 10)
                  }
                  className={inputCls}
                />
              </F>
              <F label="Total Challenge Window (Days)">
                <Input
                  type="number"
                  min="5"
                  max="180"
                  value={s.evaluation_risk?.total_trading_days ?? 30}
                  onChange={(e) =>
                    set("evaluation_risk.total_trading_days", Number(e.target.value) || 30)
                  }
                  className={inputCls}
                />
              </F>
              <F label="Target Win Accuracy Benchmark (%)">
                <Input
                  type="number"
                  min="10"
                  max="100"
                  value={s.evaluation_risk?.profit_accuracy_pct ?? 70}
                  onChange={(e) =>
                    set("evaluation_risk.profit_accuracy_pct", Number(e.target.value) || 70)
                  }
                  className={inputCls}
                />
              </F>
              <F label="Funded Profit Split (%)">
                <Input
                  type="number"
                  min="50"
                  max="95"
                  value={s.evaluation_risk?.profit_split ?? 70}
                  onChange={(e) =>
                    set("evaluation_risk.profit_split", Number(e.target.value) || 70)
                  }
                  className={inputCls}
                />
              </F>
            </Grid2>
          </Section>
        </TabsContent>
        <TabsContent value="videos">
          <Section title="Scrolling Review Videos">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={s.video_reviews?.enabled !== false}
                onChange={(e) => set("video_reviews.enabled", e.target.checked)}
                data-testid="admin-toggle-trader-videos"
              />
              Show Review Videos on Home Scrolling Review Wall
            </label>
            <Grid2>
              <F label="Heading">
                <Input
                  value={s.video_reviews?.heading || ""}
                  onChange={(e) => set("video_reviews.heading", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Subtitle">
                <Input
                  value={s.video_reviews?.subtitle || ""}
                  onChange={(e) => set("video_reviews.subtitle", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
            <p className="text-sm text-muted-foreground">
              Upload MP4/WebM/MOV videos directly or paste HTTPS MP4, WebM, YouTube or Vimeo links.
              Click Save changes to publish them to the Home page scrolling review wall.
            </p>
            <ListEditor
              items={s.video_reviews?.items || []}
              onChange={(items) => set("video_reviews.items", items)}
              empty={{
                name: "",
                role: "",
                label: "Trader review",
                url: "",
                poster: "",
                country: "",
                flag: "",
                rewards: "",
                style: "",
                views: "",
                enabled: true,
              }}
              addLabel="Add video review"
              render={(item, update) => (
                <>
                  <Grid2>
                    <F label="Trader name">
                      <Input
                        aria-label="Review trader name"
                        value={item.name || ""}
                        onChange={(e) => update({ ...item, name: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Plan or location">
                      <Input
                        aria-label="Review plan or location"
                        value={item.role || ""}
                        onChange={(e) => update({ ...item, role: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <VideoMediaUploader
                    label="Video file or URL"
                    value={item.url || ""}
                    accept="video/mp4,video/webm,video/quicktime"
                    buttonLabel="Upload Video"
                    placeholder="https://... or upload MP4/WebM/MOV (max 18MB)"
                    onChange={(url) => update({ ...item, url })}
                    previewKind="video"
                  />
                  <Grid2>
                    <VideoMediaUploader
                      label="Poster thumbnail (optional)"
                      value={item.poster || ""}
                      accept="image/jpeg,image/png,image/webp"
                      buttonLabel="Upload Poster"
                      placeholder="https://... or upload JPG/PNG"
                      onChange={(poster) => update({ ...item, poster })}
                      previewKind="image"
                    />
                    <F label="Video caption">
                      <Input
                        value={item.label || ""}
                        onChange={(e) => update({ ...item, label: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <Grid2>
                    <F label="Country">
                      <Input
                        aria-label="Review country"
                        value={item.country || ""}
                        onChange={(e) => update({ ...item, country: e.target.value })}
                        className={inputCls}
                        placeholder="Surat, India"
                      />
                    </F>
                    <F label="Flag emoji (optional)">
                      <Input
                        aria-label="Review flag"
                        value={item.flag || ""}
                        onChange={(e) => update({ ...item, flag: e.target.value })}
                        className={inputCls}
                        placeholder="🇮🇳"
                      />
                    </F>
                  </Grid2>
                  <Grid2>
                    <F label="Rewards earned">
                      <Input
                        aria-label="Review rewards earned"
                        value={item.rewards || ""}
                        onChange={(e) => update({ ...item, rewards: e.target.value })}
                        className={inputCls}
                        placeholder="₹76,000"
                      />
                    </F>
                    <F label="Trading style">
                      <Input
                        aria-label="Review trading style"
                        value={item.style || ""}
                        onChange={(e) => update({ ...item, style: e.target.value })}
                        className={inputCls}
                        placeholder="Scalper"
                      />
                    </F>
                  </Grid2>
                  <F label="Views label (optional)">
                    <Input
                      aria-label="Review views"
                      value={item.views || ""}
                      onChange={(e) => update({ ...item, views: e.target.value })}
                      className={inputCls}
                      placeholder="83K Views"
                    />
                  </F>
                  <label className="flex gap-3 items-center">
                    <input
                      type="checkbox"
                      checked={item.enabled !== false}
                      onChange={(e) => update({ ...item, enabled: e.target.checked })}
                    />
                    Publish this review
                  </label>
                </>
              )}
            />
          </Section>
        </TabsContent>
        <TabsContent value="testi">
          <Section title="Testimonials (Why traders choose …)">
            <ListEditor
              items={s.testimonials}
              onChange={(arr) => set("testimonials", arr)}
              empty={{ q: "", a: "", r: "" }}
              render={(it, upd) => (
                <>
                  <F label="Quote">
                    <Textarea
                      rows={3}
                      value={it.q}
                      onChange={(e) => upd({ ...it, q: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                  <Grid2>
                    <F label="Author">
                      <Input
                        value={it.a}
                        onChange={(e) => upd({ ...it, a: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Role / Plan">
                      <Input
                        value={it.r}
                        onChange={(e) => upd({ ...it, r: e.target.value })}
                        className={inputCls}
                        placeholder="Pro Plan"
                      />
                    </F>
                  </Grid2>
                </>
              )}
            />
          </Section>
        </TabsContent>

        <TabsContent value="faq">
          <Section title="FAQ Groups">
            <ListEditor
              items={s.faq_groups}
              onChange={(arr) => set("faq_groups", arr)}
              empty={{ title: "New group", items: [] }}
              addLabel="Add group"
              render={(g, upd) => (
                <>
                  <F label="Group title">
                    <Input
                      value={g.title}
                      onChange={(e) => upd({ ...g, title: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                  <div className="mt-4 pl-4 border-l border-[var(--border-hi)]">
                    <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider mb-3">
                      Questions in this group
                    </div>
                    <ListEditor
                      items={g.items || []}
                      onChange={(arr) => upd({ ...g, items: arr })}
                      empty={{ q: "", a: "" }}
                      addLabel="Add question"
                      render={(it, updIt) => (
                        <>
                          <F label="Question">
                            <Input
                              value={it.q}
                              onChange={(e) => updIt({ ...it, q: e.target.value })}
                              className={inputCls}
                            />
                          </F>
                          <F label="Answer">
                            <Textarea
                              rows={3}
                              value={it.a}
                              onChange={(e) => updIt({ ...it, a: e.target.value })}
                              className={inputCls}
                            />
                          </F>
                        </>
                      )}
                    />
                  </div>
                </>
              )}
            />
          </Section>
        </TabsContent>

        <TabsContent value="rules">
          <Section title="Rules Page">
            <F label="Title">
              <Input
                value={s.rules.title}
                onChange={(e) => set("rules.title", e.target.value)}
                className={inputCls}
              />
            </F>
            <F label="Subtitle">
              <Textarea
                rows={2}
                value={s.rules.subtitle}
                onChange={(e) => set("rules.subtitle", e.target.value)}
                className={inputCls}
              />
            </F>
            <ListEditor
              items={s.rules.items}
              onChange={(arr) => set("rules.items", arr)}
              empty={{ t: "", d: "", i: "CheckCircle2" }}
              addLabel="Add rule"
              render={(it, upd) => (
                <>
                  <Grid2>
                    <F label="Title">
                      <Input
                        value={it.t}
                        onChange={(e) => upd({ ...it, t: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Icon (Scale/TrendingDown/ShieldCheck/BookOpen/Users/CheckCircle2)">
                      <Input
                        value={it.i}
                        onChange={(e) => upd({ ...it, i: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <F label="Description">
                    <Textarea
                      rows={2}
                      value={it.d}
                      onChange={(e) => upd({ ...it, d: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                </>
              )}
            />
          </Section>
        </TabsContent>

        <TabsContent value="trust">
          <Section title="Trust & Transparency section">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={s.trust?.enabled !== false}
                onChange={(e) => set("trust.enabled", e.target.checked)}
              />
              Show Trust section
            </label>
            <Grid2>
              <F label="Heading">
                <Input
                  value={s.trust?.heading || ""}
                  onChange={(e) => set("trust.heading", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Subtitle">
                <Input
                  value={s.trust?.subtitle || ""}
                  onChange={(e) => set("trust.subtitle", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
          </Section>
          <Section title="Platform Statistics (Total Amount Paid, Successful Payouts, Active Users, Total Traders)">
            <p className="text-xs text-[var(--muted)] mb-2">
              Edit the 4 public platform metrics displayed on the Homepage and Trust Center.
            </p>
            <ListEditor
              items={s.trust?.stats || []}
              onChange={(v) => set("trust.stats", v)}
              empty={{ label: "", value: "" }}
              addLabel="Add statistic"
              render={(it, upd, idx) => (
                <Grid2>
                  <F label="Label">
                    <Input
                      value={it.label}
                      onChange={(e) => upd({ ...it, label: e.target.value })}
                      className={inputCls}
                      placeholder="Total Amount Paid"
                      data-testid={`admin-trust-stat-label-${idx}`}
                    />
                  </F>
                  <F label="Value">
                    <Input
                      value={it.value}
                      onChange={(e) => upd({ ...it, value: e.target.value })}
                      className={inputCls}
                      placeholder="₹12,50,000"
                      data-testid={`admin-trust-stat-value-${idx}`}
                    />
                  </F>
                </Grid2>
              )}
            />
          </Section>
          <Section title="Trust Center & Transparency Labels (Every Text)">
            <Grid2>
              {[
                ["page_chip", "Trust Page Chip"],
                ["home_eyebrow", "Home Trust Eyebrow"],
                ["company_band_eyebrow", "Home Company Band Eyebrow"],
                ["company_band_heading", "Home Company Band Heading"],
                ["verify_cta", "Verify Payout Button"],
                ["trust_center_cta", "Trust Center Button"],
                ["payout_records_cta", "Payout Records Button"],
                ["home_proofs_heading", "Home Payout Proofs Heading"],
                ["page_proofs_heading", "Trust Page Payout Proofs Heading"],
                ["stories_heading", "Success Stories Heading"],
                ["verified_badge", "Proof Card Verified Badge"],
                ["trader_id_label", "Proof Field: Trader ID Label"],
                ["account_id_label", "Proof Field: Account ID Label"],
                ["requested_label", "Proof Field: Requested Label"],
                ["paid_label", "Proof Field: Paid Label"],
                ["method_label", "Proof Field: Method Label"],
                ["utr_label", "Proof Field: UTR Label"],
                ["withdrawn_label", "Story Card Withdrawn Suffix"],
                ["company_fallback_heading", "Company Card Fallback Heading"],
                ["support_team_heading", "Support Team Card Heading"],
                ["support_team_empty_prefix", "Support Team Empty Prefix"],
                ["support_team_empty_fallback", "Support Team Empty Fallback Email"],
                ["instagram_label", "Instagram Link Label"],
                ["telegram_label", "Telegram Link Label"],
              ].map(([k, lbl]) => (
                <F key={k} label={lbl}>
                  <Input
                    value={s.trust?.labels?.[k] || ""}
                    onChange={(e) => set(`trust.labels.${k}`, e.target.value)}
                    className={inputCls}
                    data-testid={`admin-trust-label-${k}`}
                  />
                </F>
              ))}
            </Grid2>
          </Section>
          <Section title="Company details">
            <Grid2>
              {[
                ["legal_name", "Legal name"],
                ["gst", "GST number"],
                ["cin", "CIN"],
                ["pan", "PAN"],
                ["phone", "Contact number"],
                ["email", "Support email"],
                ["instagram", "Instagram URL"],
                ["telegram", "Telegram URL"],
              ].map(([k, l]) => (
                <F key={k} label={l}>
                  <Input
                    value={s.trust?.company?.[k] || ""}
                    onChange={(e) => set(`trust.company.${k}`, e.target.value)}
                    className={inputCls}
                  />
                </F>
              ))}
            </Grid2>
            <F label="Physical office address">
              <Textarea
                rows={2}
                value={s.trust?.company?.address || ""}
                onChange={(e) => set("trust.company.address", e.target.value)}
                className={inputCls}
              />
            </F>
          </Section>
          <Section title="Support team">
            <ListEditor
              items={s.trust?.support_team || []}
              onChange={(v) => set("trust.support_team", v)}
              empty={{ name: "", role: "", contact: "" }}
              addLabel="Add team member"
              render={(it, upd) => (
                <Grid2>
                  <F label="Name">
                    <Input
                      value={it.name}
                      onChange={(e) => upd({ ...it, name: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                  <F label="Role">
                    <Input
                      value={it.role}
                      onChange={(e) => upd({ ...it, role: e.target.value })}
                      className={inputCls}
                      placeholder="Payout desk"
                    />
                  </F>
                  <F label="Contact (optional)">
                    <Input
                      value={it.contact}
                      onChange={(e) => upd({ ...it, contact: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                </Grid2>
              )}
            />
          </Section>
          <Section title="Payout proofs (public — only last 4 UTR digits are stored)">
            <ListEditor
              items={s.trust?.payout_proofs || []}
              onChange={(v) => set("trust.payout_proofs", v)}
              empty={{
                payout_id: "",
                trader_id: "",
                account_id: "",
                amount: "",
                request_date: "",
                payment_date: "",
                method: "Bank transfer",
                utr_last4: "",
                enabled: true,
              }}
              addLabel="Add payout proof"
              render={(it, upd) => (
                <>
                  <Grid2>
                    {[
                      ["payout_id", "Payout ID"],
                      ["trader_id", "Trader ID"],
                      ["account_id", "Account ID"],
                      ["amount", "Amount (₹)"],
                      ["request_date", "Request date"],
                      ["payment_date", "Payment date"],
                      ["method", "Payment method"],
                    ].map(([k, l]) => (
                      <F key={k} label={l}>
                        <Input
                          value={it[k] || ""}
                          onChange={(e) => upd({ ...it, [k]: e.target.value })}
                          className={inputCls}
                          type={k.endsWith("date") ? "date" : "text"}
                        />
                      </F>
                    ))}
                    <F label="UTR — last 4 digits">
                      <Input
                        value={it.utr_last4 || ""}
                        onChange={(e) => upd({ ...it, utr_last4: utrLast4(e.target.value) })}
                        className={inputCls}
                        placeholder="1234"
                        maxLength={20}
                      />
                    </F>
                  </Grid2>
                  <label className="flex gap-3 items-center">
                    <input
                      type="checkbox"
                      checked={it.enabled !== false}
                      onChange={(e) => upd({ ...it, enabled: e.target.checked })}
                    />
                    Publish & allow verification
                  </label>
                </>
              )}
            />
          </Section>
          <Section title="Certificates & awards (QR verification)">
            <ListEditor
              items={s.trust?.credentials || []}
              onChange={(v) => set("trust.credentials", v)}
              empty={{
                code: "",
                type: "certificate",
                trader_name: "",
                title: "",
                amount: "",
                issued_date: "",
                enabled: true,
              }}
              addLabel="Add certificate / award"
              render={(it, upd) => (
                <>
                  <Grid2>
                    <F label="Unique code">
                      <Input
                        value={it.code}
                        onChange={(e) =>
                          upd({
                            ...it,
                            code: e.target.value.replace(/[^A-Za-z0-9-]/g, "").toUpperCase(),
                          })
                        }
                        className={inputCls}
                        placeholder="IF-CERT-0001"
                      />
                    </F>
                    <F label="Type">
                      <select
                        value={it.type}
                        onChange={(e) => upd({ ...it, type: e.target.value })}
                        className={`flex h-10 w-full rounded-md border px-3 text-sm ${inputCls}`}
                      >
                        <option value="certificate">Certificate</option>
                        <option value="award">Award</option>
                      </select>
                    </F>
                    <F label="Trader name">
                      <Input
                        value={it.trader_name}
                        onChange={(e) => upd({ ...it, trader_name: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Title">
                      <Input
                        value={it.title}
                        onChange={(e) => upd({ ...it, title: e.target.value })}
                        className={inputCls}
                        placeholder="Funded Trader — ₹5L"
                      />
                    </F>
                    <F label="Amount (optional)">
                      <Input
                        value={it.amount}
                        onChange={(e) => upd({ ...it, amount: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                    <F label="Issued date">
                      <Input
                        type="date"
                        value={it.issued_date}
                        onChange={(e) => upd({ ...it, issued_date: e.target.value })}
                        className={inputCls}
                      />
                    </F>
                  </Grid2>
                  <label className="flex gap-3 items-center">
                    <input
                      type="checkbox"
                      checked={it.enabled !== false}
                      onChange={(e) => upd({ ...it, enabled: e.target.checked })}
                    />
                    Published
                  </label>
                  {it.code && (
                    <div className="flex items-center gap-4">
                      <div className="trust-qr">
                        <QRCodeSVG
                          value={`${window.location.origin}/verify/${encodeURIComponent(it.code)}`}
                          size={96}
                        />
                      </div>
                      <a
                        href={`/verify/${encodeURIComponent(it.code)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-[var(--accent)] hover:underline"
                      >
                        Open verification page
                      </a>
                    </div>
                  )}
                </>
              )}
            />
          </Section>
          <Section title="Trader success stories">
            <label className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                checked={s.trust?.stories_enabled !== false}
                onChange={(e) => set("trust.stories_enabled", e.target.checked)}
                data-testid="admin-toggle-success-stories"
              />
              Show Trader Success Stories across Home, Trust &amp; /stories
            </label>
            <ListEditor
              items={s.trust?.stories || []}
              onChange={(v) => set("trust.stories", v)}
              empty={{ name: "", city: "", plan: "", payout: "", story: "", enabled: true }}
              addLabel="Add story"
              render={(it, upd) => (
                <>
                  <Grid2>
                    {[
                      ["name", "Trader name"],
                      ["city", "City"],
                      ["plan", "Plan"],
                      ["payout", "Payout withdrawn (₹)"],
                    ].map(([k, l]) => (
                      <F key={k} label={l}>
                        <Input
                          value={it[k] || ""}
                          onChange={(e) => upd({ ...it, [k]: e.target.value })}
                          className={inputCls}
                        />
                      </F>
                    ))}
                  </Grid2>
                  <F label="Story">
                    <Textarea
                      rows={3}
                      value={it.story}
                      onChange={(e) => upd({ ...it, story: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                  <label className="flex gap-3 items-center">
                    <input
                      type="checkbox"
                      checked={it.enabled !== false}
                      onChange={(e) => upd({ ...it, enabled: e.target.checked })}
                    />
                    Published
                  </label>
                </>
              )}
            />
          </Section>
          <p className="text-sm text-[var(--muted)]">
            Payout videos are managed in the Review Videos tab.
          </p>
        </TabsContent>

        <TabsContent value="about">
          <Section title="About Page">
            <F label="Title">
              <Input
                value={s.about.title}
                onChange={(e) => set("about.title", e.target.value)}
                className={inputCls}
              />
            </F>
            <F label="Intro paragraph">
              <Textarea
                rows={4}
                value={s.about.intro}
                onChange={(e) => set("about.intro", e.target.value)}
                className={inputCls}
              />
            </F>
            <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider mt-6 mb-3">
              Info cards (3)
            </div>
            <ListEditor
              items={s.about.cards}
              onChange={(arr) => set("about.cards", arr)}
              empty={{ t: "", d: "" }}
              render={(it, upd) => (
                <>
                  <F label="Title">
                    <Input
                      value={it.t}
                      onChange={(e) => upd({ ...it, t: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                  <F label="Description">
                    <Textarea
                      rows={3}
                      value={it.d}
                      onChange={(e) => upd({ ...it, d: e.target.value })}
                      className={inputCls}
                    />
                  </F>
                </>
              )}
            />
            <Grid2>
              <F label="Footer card title">
                <Input
                  value={s.about.footer_title}
                  onChange={(e) => set("about.footer_title", e.target.value)}
                  className={inputCls}
                />
              </F>
              <F label="Footer card text">
                <Textarea
                  rows={3}
                  value={s.about.footer_text}
                  onChange={(e) => set("about.footer_text", e.target.value)}
                  className={inputCls}
                />
              </F>
            </Grid2>
          </Section>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-4 mt-10 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="btn-amber rounded-full px-6 py-3 text-sm inline-flex items-center gap-2 shadow-2xl disabled:opacity-60"
        >
          <Save size={16} /> {saving ? "Saving…" : "Save all changes"}
        </button>
      </div>
    </div>
  );
}

function T({ v, icon, children }) {
  return (
    <TabsTrigger
      value={v}
      className="data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white px-3 py-2 rounded-xl text-sm inline-flex items-center gap-2"
    >
      {icon}
      {children}
    </TabsTrigger>
  );
}
function Section({ title, children }) {
  return (
    <div className="glass-card p-6 md:p-8 mb-6">
      <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider mb-5">
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
function Grid2({ children }) {
  return <div className="grid md:grid-cols-2 gap-4">{children}</div>;
}
function F({ label, children }) {
  return (
    <div>
      <Label className="text-xs uppercase font-mono tracking-wider text-[var(--muted-2)]">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ListEditor({ items = [], onChange, render, empty, addLabel = "Add item" }) {
  const upd = (i, v) => {
    const a = [...items];
    a[i] = v;
    onChange(a);
  };
  const del = (i) => {
    const a = [...items];
    a.splice(i, 1);
    onChange(a);
  };
  const add = () => onChange([...items, deepClone(empty)]);
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const a = [...items];
    [a[i], a[j]] = [a[j], a[i]];
    onChange(a);
  };
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border)] p-4 relative bg-[rgba(255,255,255,0.01)]"
        >
          <div className="flex justify-between items-center mb-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
              #{i + 1}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => move(i, -1)}
                className="btn-ghost rounded-md px-2 py-1 text-xs"
                title="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => move(i, 1)}
                className="btn-ghost rounded-md px-2 py-1 text-xs"
                title="Move down"
              >
                ↓
              </button>
              <button
                onClick={() => del(i)}
                className="btn-ghost rounded-md px-2 py-1 text-xs text-[var(--rose)]"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          <div className="space-y-3">{render(it, (v) => upd(i, v), i)}</div>
        </div>
      ))}
      <Button variant="outline" onClick={add}>
        <Plus size={12} /> {addLabel}
      </Button>
    </div>
  );
}

function VideoMediaUploader({
  label,
  value,
  accept,
  buttonLabel,
  placeholder,
  onChange,
  previewKind,
}) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const maxBytes = previewKind === "video" ? 18 * 1024 * 1024 : 6 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(
        previewKind === "video" ? "Video must be under 18 MB." : "Poster image must be under 6 MB.",
      );
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Could not read file");
      const uploadId = crypto.randomUUID();
      const parts = match[2].match(/.{1,2097152}/g) || [];
      let data;
      for (let index = 0; index < parts.length; index++) {
        try {
          const response = await api.post("/admin/media", {
            upload_id: uploadId, index, total: parts.length, content_type: match[1], chunk: parts[index],
            filename: file.name,
          });
          data = response.data;
        } catch (error) {
          if (index !== 0 || error?.response?.status !== 400) throw error;
          data = (await api.post("/admin/media", { data_url: dataUrl, filename: file.name })).data;
          break;
        }
      }
      if (data?.url) {
        onChange(data.url);
        toast.success("Uploaded — click Save changes to publish");
      }
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const media = previewKind === "video" ? getReviewMedia(value || "") : null;

  return (
    <F label={label}>
      <div className="flex flex-wrap gap-2 items-center mt-2">
        <Input
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-[var(--bg-1)] border-[var(--border-hi)] flex-1 min-w-[200px]"
          placeholder={placeholder}
        />
        <label className="btn-ghost rounded-lg px-3.5 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0">
          <Upload size={13} />
          {uploading ? "Uploading…" : buttonLabel}
          <input type="file" accept={accept} className="sr-only" onChange={handleFile} />
        </label>
      </div>
      {media?.kind === "video" && (
        <video
          src={media.url}
          controls
          autoPlay
          loop
          muted
          playsInline
          className="h-32 rounded-lg border border-[var(--border)] bg-black/40 mt-2"
        />
      )}
      {previewKind === "image" && value && (
        <img
          src={value}
          alt="Poster preview"
          className="h-20 w-auto rounded-lg border border-[var(--border)] object-cover mt-2"
        />
      )}
    </F>
  );
}

function ChartSpeedControlSection({ s, set }) {
  const cfg = s.widgets?.chart_feed || {};
  const enabled = cfg.enabled !== false;
  const fallback3 = cfg.fallback_last3_digits !== false;
  const reconcile = cfg.reconcile_on_api !== false;
  const tickMs = clampTickIntervalMs(cfg.tick_interval_ms ?? 150);

  const [preview, setPreview] = useState({ price: 25450.35, offset: 0, dir: "up", seq: 0 });
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setPreview((cur) => {
        const nextSeq = cur.seq + 1;
        const { price, offset } = computeLast3DigitTick(25450.35, cur.offset, nextSeq);
        return {
          price,
          offset,
          dir: price >= cur.price ? "up" : "down",
          seq: nextSeq,
        };
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [enabled, tickMs]);

  return (
    <Section title="Live Chart Speed & Fallback Engine (All Charts & Tickers)">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-[var(--border-hi)] bg-[var(--bg-1)]/70">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[var(--accent)]">
            <Activity size={13} /> Millisecond Chart Tick Rate
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">
            Controls how fast candlestick &amp; price tickers tick across Home preview, Market
            Ticker, and Trader Terminal during live NSE/BSE market hours. Automatically pauses on
            the authoritative closing price when markets are closed, and snaps to real API data once
            received.
          </p>
        </div>
        <div
          className="px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] min-w-[170px] text-right tabular-nums"
          data-testid="chart-speed-preview"
        >
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            Live Preview · NIFTY
          </div>
          <div
            className={`font-mono text-xl font-bold mt-0.5 ${
              preview.dir === "up" ? "text-[#089981]" : "text-[#F23645]"
            }`}
          >
            {formatPrice(preview.price)}
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-1">
        <div>
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-[var(--muted-2)] mb-2">
            <span className="inline-flex items-center gap-1.5">
              <Zap size={12} className="text-[var(--accent)]" /> Speed Presets
            </span>
            <span
              className="text-[var(--text)] font-bold tabular-nums"
              data-testid="chart-speed-readout"
            >
              {tickMs}ms ({(1000 / tickMs).toFixed(1)} ticks/sec)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {CHART_SPEED_PRESETS.map((p) => {
              const active = tickMs === p.ms;
              return (
                <button
                  key={p.ms}
                  type="button"
                  onClick={() => set("widgets.chart_feed.tick_interval_ms", p.ms)}
                  data-testid={`chart-speed-preset-${p.ms}`}
                  className={`px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? "border-[#089981] bg-[#089981]/15 text-white shadow-sm"
                      : "border-[var(--border)] bg-[var(--bg-1)]/60 text-[var(--muted)] hover:border-[var(--border-hi)] hover:text-white"
                  }`}
                >
                  <div className="font-mono text-sm font-bold tabular-nums">{p.label}</div>
                  <div className="text-[11px] opacity-80">{p.tag}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[var(--muted)] mb-1.5">
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal size={12} /> Fine Speed Slider (50ms – 2000ms)
            </span>
            <span className="tabular-nums">{tickMs} ms</span>
          </div>
          <input
            type="range"
            min={50}
            max={2000}
            step={25}
            value={tickMs}
            onChange={(e) => set("widgets.chart_feed.tick_interval_ms", Number(e.target.value))}
            data-testid="chart-speed-slider"
            className="w-full accent-[#089981] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-[var(--muted-2)] mt-1">
            <span>50ms (Ultra Fast)</span>
            <span>500ms</span>
            <span>1000ms</span>
            <span>2000ms (Calm)</span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3 pt-1">
          <label className="flex items-center gap-2.5 text-sm p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-1)]/50 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => set("widgets.chart_feed.enabled", e.target.checked)}
              data-testid="chart-feed-enabled"
            />
            <span>Enable sub-second live chart ticks</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-1)]/50 cursor-pointer">
            <input
              type="checkbox"
              checked={fallback3}
              onChange={(e) => set("widgets.chart_feed.fallback_last3_digits", e.target.checked)}
              data-testid="chart-feed-fallback3"
            />
            <span>Auto-tick last 3 digits during live market hours</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-1)]/50 cursor-pointer">
            <input
              type="checkbox"
              checked={reconcile}
              onChange={(e) => set("widgets.chart_feed.reconcile_on_api", e.target.checked)}
              data-testid="chart-feed-reconcile"
            />
            <span>Auto-match incoming live API prices</span>
          </label>
        </div>
      </div>
    </Section>
  );
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v ?? null));
}
function setDeep(obj, path, value) {
  const parts = path.split(".");
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...(cur[k] || {}) };
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return out;
}
