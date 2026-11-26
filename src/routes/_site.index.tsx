import { createFileRoute } from "@tanstack/react-router";
import Home from "@/views/Home";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import { buildFaqSchema, buildRouteHead } from "@/lib/seo";

const HOME_FAQS = (DEFAULT_SETTINGS.faq_groups || [])
  .flatMap((group) => group.items || [])
  .slice(0, 6);

export const Route = createFileRoute("/_site/")({
  head: () =>
    buildRouteHead({
      title: "IndiFunded | Indian Trading Challenges & Funded Trader Programs",
      description:
        "Explore IndiFunded trading challenges designed for traders interested in Indian markets. Discover challenge rules, account options, trading objectives and program details.",
      path: "/",
      breadcrumbs: [{ name: "Home", path: "/" }],
      extraSchemas: HOME_FAQS.length ? [buildFaqSchema(HOME_FAQS)] : [],
    }),
  component: Home,
});
