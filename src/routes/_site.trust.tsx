import { createFileRoute } from "@tanstack/react-router";
import { TrustCenter } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/trust")({
  head: () =>
    buildRouteHead({
      title: "Trust & Transparency Center | IndiFunded",
      description:
        "Verify IndiFunded company registration details for BRVS Education Pvt Ltd, support contacts, and published payout verification records.",
      path: "/trust",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Trust Center", path: "/trust" },
      ],
    }),
  component: TrustCenter,
});
