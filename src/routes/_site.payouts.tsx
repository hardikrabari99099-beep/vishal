import { createFileRoute } from "@tanstack/react-router";
import { Payouts } from "@/views/SimplePages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/payouts")({
  head: () =>
    buildRouteHead({
      title: "Funded Trader Payouts & Withdrawals | IndiFunded",
      description:
        "Submit profit withdrawal requests for your IndiFunded funded trading account via UPI or bank transfer, reviewed and processed within 24 hours.",
      path: "/payouts",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Payouts", path: "/payouts" },
      ],
    }),
  component: Payouts,
});
