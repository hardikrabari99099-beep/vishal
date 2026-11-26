import { createFileRoute } from "@tanstack/react-router";
import Referral from "@/views/Referral";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/refer")({
  head: () =>
    buildRouteHead({
      title: "Refer & Earn Trader Rewards | IndiFunded",
      description:
        "Generate your IndiFunded referral code so fellow Indian traders save 5% on challenge fees while you earn referral rewards per qualifying signup.",
      path: "/refer",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Refer & Earn", path: "/refer" },
      ],
    }),
  component: Referral,
});
