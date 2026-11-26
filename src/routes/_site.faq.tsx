import { createFileRoute } from "@tanstack/react-router";
import { FAQ } from "@/views/SimplePages";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import { buildFaqSchema, buildRouteHead } from "@/lib/seo";

const ALL_FAQS = (DEFAULT_SETTINGS.faq_groups || []).flatMap(
  (group) => group.items || [],
);

export const Route = createFileRoute("/_site/faq")({
  head: () =>
    buildRouteHead({
      title: "Prop Trading & Challenge FAQs India | IndiFunded",
      description:
        "Find clear answers on IndiFunded challenge rules, SEBI status, Nifty and Bank Nifty trading segments, broker integrations, scaling, and payout processing.",
      path: "/faq",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "FAQs", path: "/faq" },
      ],
      extraSchemas: ALL_FAQS.length ? [buildFaqSchema(ALL_FAQS)] : [],
    }),
  component: FAQ,
});
