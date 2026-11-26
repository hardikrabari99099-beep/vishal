import { useEffect } from "react";
import { getCanonicalUrl, getFullImageUrl, SITE_NAME } from "./seo";

/**
 * Lightweight SEO hook — keeps client-side route transitions and dynamic
 * pages (e.g. blog articles, live challenge plans) in sync with canonical,
 * Open Graph, Twitter/X, robots, and page JSON-LD tags.
 */
export function useSEO({
  title,
  description,
  path = "/",
  image,
  type = "website",
  noindex = false,
  jsonLd,
} = {}) {
  const jsonLdStr = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    const fullTitle = title
      ? /indifunded/i.test(title)
        ? title
        : `${title} | ${SITE_NAME}`
      : "IndiFunded | Indian Trading Challenges & Funded Trader Programs";
    const desc =
      description ||
      "Explore IndiFunded trading challenges designed for traders interested in Indian markets. Discover challenge rules, account options, trading objectives and program details.";
    const url = getCanonicalUrl(path || window.location.pathname);
    const fullImage = getFullImageUrl(image);

    document.title = fullTitle;

    const setMeta = (selector, attr, value) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const match = selector.match(/\[([^=]+)="([^"]+)"\]/);
        if (match) {
          el.setAttribute(match[1], match[2]);
        }
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    // Clean up legacy malformed property="twitter:*" tags if present
    document.head
      .querySelectorAll('meta[property^="twitter:"]')
      .forEach((node) => node.remove());

    setMeta('meta[name="description"]', "content", desc);
    setMeta(
      'meta[name="robots"]',
      "content",
      noindex ? "noindex, nofollow" : "index, follow",
    );

    setMeta('meta[property="og:title"]', "content", fullTitle);
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:image"]', "content", fullImage);
    setMeta('meta[property="og:type"]', "content", type);

    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "content", fullTitle);
    setMeta('meta[name="twitter:description"]', "content", desc);
    setMeta('meta[name="twitter:image"]', "content", fullImage);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (noindex) {
      if (canonical) canonical.remove();
    } else {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.setAttribute("rel", "canonical");
        document.head.appendChild(canonical);
      }
      canonical.setAttribute("href", url);
    }

    let scriptEl = document.head.querySelector(
      'script[data-page-jsonld="true"]',
    );
    if (jsonLdStr && !noindex) {
      if (!scriptEl) {
        scriptEl = document.createElement("script");
        scriptEl.type = "application/ld+json";
        scriptEl.setAttribute("data-page-jsonld", "true");
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = jsonLdStr;
    } else if (scriptEl) {
      scriptEl.remove();
    }
  }, [title, description, path, image, type, noindex, jsonLdStr]);
}
