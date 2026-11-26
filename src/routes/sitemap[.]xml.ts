import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo";

interface SitemapEntry {
  loc: string;
  changefreq: string;
  priority: string;
  lastmod?: string;
}

const STATIC_ENTRIES: SitemapEntry[] = [
  { loc: `${SITE_URL}/`, changefreq: "weekly", priority: "1.0" },
  { loc: `${SITE_URL}/challenges`, changefreq: "weekly", priority: "0.95" },
  { loc: `${SITE_URL}/rules`, changefreq: "monthly", priority: "0.9" },
  { loc: `${SITE_URL}/how-it-works`, changefreq: "monthly", priority: "0.85" },
  { loc: `${SITE_URL}/faq`, changefreq: "monthly", priority: "0.85" },
  { loc: `${SITE_URL}/about`, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/blog`, changefreq: "weekly", priority: "0.85" },
  { loc: `${SITE_URL}/payouts`, changefreq: "weekly", priority: "0.8" },
  { loc: `${SITE_URL}/payout-request`, changefreq: "monthly", priority: "0.7" },
  { loc: `${SITE_URL}/verify-payout`, changefreq: "weekly", priority: "0.75" },
  { loc: `${SITE_URL}/leaderboard`, changefreq: "daily", priority: "0.8" },
  { loc: `${SITE_URL}/league`, changefreq: "weekly", priority: "0.75" },
  { loc: `${SITE_URL}/trust`, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/stories`, changefreq: "weekly", priority: "0.75" },
  { loc: `${SITE_URL}/refer`, changefreq: "monthly", priority: "0.7" },
  { loc: `${SITE_URL}/contact`, changefreq: "monthly", priority: "0.75" },
  { loc: `${SITE_URL}/privacy`, changefreq: "yearly", priority: "0.4" },
  { loc: `${SITE_URL}/terms`, changefreq: "yearly", priority: "0.4" },
  { loc: `${SITE_URL}/refund-policy`, changefreq: "yearly", priority: "0.4" },
  { loc: `${SITE_URL}/risk-disclosure`, changefreq: "yearly", priority: "0.4" },
];

const FALLBACK_BLOG_SLUGS = [
  "turn-small-investment-into-profitable-trading",
  "rise-of-indifunded-indian-trading",
  "strategies-for-maximizing-profits",
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toValidIsoDate(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().split("T")[0];
}

async function getPublishedBlogEntries(): Promise<SitemapEntry[]> {
  try {
    const { handleApi } = await import("@/server/api-handler");
    const res = await handleApi(
      new Request(`${SITE_URL}/api/blogs`, { method: "GET" }),
      "blogs",
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const seen = new Set<string>();
        const entries: SitemapEntry[] = [];
        for (const post of data) {
          if (!post || post.published === false) continue;
          const slug = String(post.slug || "").trim();
          if (!slug || seen.has(slug)) continue;
          seen.add(slug);
          const lastmod = toValidIsoDate(post.updated_at || post.created_at);
          entries.push({
            loc: `${SITE_URL}/blog/${encodeURIComponent(slug)}`,
            changefreq: "monthly",
            priority: "0.75",
            ...(lastmod ? { lastmod } : {}),
          });
        }
        if (entries.length > 0) return entries;
      }
    }
  } catch {
    // Fall through to seeded blog slugs without throwing
  }

  return FALLBACK_BLOG_SLUGS.map((slug) => ({
    loc: `${SITE_URL}/blog/${slug}`,
    changefreq: "monthly",
    priority: "0.75",
  }));
}

async function serveSitemap() {
  const blogEntries = await getPublishedBlogEntries();
  const entries = [...STATIC_ENTRIES, ...blogEntries];

  const urlsXml = entries
    .map((entry) => {
      const lastmodTag = entry.lastmod
        ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`
        : "";
      return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmodTag}\n    <changefreq>${escapeXml(entry.changefreq)}</changefreq>\n    <priority>${escapeXml(entry.priority)}</priority>\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: serveSitemap,
    },
  },
});
