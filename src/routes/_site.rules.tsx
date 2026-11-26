import { createFileRoute } from "@tanstack/react-router";
import { Rules } from "@/views/SimplePages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/rules")({
  head: () =>
    buildRouteHead({
      title: "Trading Challenge Rules & Funded Policies | IndiFunded",
      description:
        "Review IndiFunded evaluation rules for Nifty and Bank Nifty option buying, 70/30 profit sharing, 20% funded max drawdown, scaling criteria, and payouts.",
      path: "/rules",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Challenge Rules", path: "/rules" },
      ],
    }),
  component: Rules,
});
