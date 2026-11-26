import { DEFAULT_SETTINGS } from "./default-settings";

export const SITE_URL = "https://indifunded.com";
export const SITE_NAME = "IndiFunded";
export const LEGAL_NAME = "BRVS Education Pvt Ltd";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/aistudio/Teal_Gradient_F_Emblem_03195f4a.png`;

export function normalizeSeoPath(path = "/"): string {
  const raw = String(path || "/")
    .split("?")[0]
    .split("#")[0]
    .trim();
  if (!raw || raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

export function getCanonicalUrl(path = "/"): string {
  const clean = normalizeSeoPath(path);
  return clean === "/" ? `${SITE_URL}/` : `${SITE_URL}${clean}`;
}

export function getFullImageUrl(image?: string): string {
  if (!image) return DEFAULT_OG_IMAGE;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  return `${SITE_URL}${image.startsWith("/") ? image : `/${image}`}`;
}

export function buildOrganizationSchema() {
  const s = DEFAULT_SETTINGS;
  const socialLinks = [
    s.social?.instagram,
    s.social?.youtube,
    s.social?.twitter,
    s.social?.facebook,
  ].filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    legalName: s.trust?.company?.legal_name || LEGAL_NAME,
    url: `${SITE_URL}/`,
    logo: {
      "@type": "ImageObject",
      url: DEFAULT_OG_IMAGE,
    },
    description:
      "IndiFunded is an Indian proprietary trading evaluation platform operated by BRVS Education Pvt Ltd, offering Nifty and Bank Nifty trading challenges and funded trader programs.",
    email: s.contact?.email || "support@indifunded.com",
    telephone: s.contact?.phone || "+91 78019 20564",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Unique Square, Causeway, Katargam",
      addressLocality: "Surat",
      addressRegion: "Gujarat",
      addressCountry: "IN",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: s.contact?.email || "support@indifunded.com",
      telephone: s.contact?.phone || "+91 78019 20564",
      areaServed: "IN",
      availableLanguage: ["English", "Hindi"],
    },
    sameAs: socialLinks,
  };
}

export function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: "en-IN",
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
  };
}

export function buildBreadcrumbSchema(
  items: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: getCanonicalUrl(item.path),
    })),
  };
}

export function buildWebPageSchema({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const url = getCanonicalUrl(path);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: "en-IN",
    isPartOf: {
      "@id": `${SITE_URL}/#website`,
    },
    about: {
      "@id": `${SITE_URL}/#organization`,
    },
  };
}

export function buildFaqSchema(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items
      .filter((item) => item?.q && item?.a)
      .map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
  };
}

export interface RouteHeadOptions {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: string;
  noindex?: boolean;
  breadcrumbs?: Array<{ name: string; path: string }>;
  extraSchemas?: Array<Record<string, unknown>>;
}

export function buildRouteHead({
  title,
  description,
  path,
  type = "website",
  image,
  noindex = false,
  breadcrumbs,
  extraSchemas = [],
}: RouteHeadOptions) {
  const url = getCanonicalUrl(path);
  const fullImage = getFullImageUrl(image);
  const robotsContent = noindex ? "noindex, nofollow" : "index, follow";

  const meta = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robotsContent },
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: fullImage },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: fullImage },
  ];

  const links = noindex ? [] : [{ rel: "canonical", href: url }];

  const schemas: Array<Record<string, unknown>> = noindex
    ? []
    : [
        buildWebPageSchema({ title, description, path }),
        ...(breadcrumbs && breadcrumbs.length > 0
          ? [buildBreadcrumbSchema(breadcrumbs)]
          : []),
        ...extraSchemas,
      ];

  const scripts = schemas.map((schema) => ({
    type: "application/ld+json",
    children: JSON.stringify(schema),
  }));

  return {
    meta,
    links,
    ...(scripts.length > 0 ? { scripts } : {}),
  };
}
