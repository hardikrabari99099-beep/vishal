import { createFileRoute } from "@tanstack/react-router";
import PayoutRequest from "@/views/PayoutRequest";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/payout-request")({
  head: () =>
    buildRouteHead({
      title: "Request Profit Payout via UPI or Bank | IndiFunded",
      description:
        "Submit a payout request for your IndiFunded funded account. Profits are verified and transferred via UPI, NEFT, or IMPS within 24 hours.",
      path: "/payout-request",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Request Payout", path: "/payout-request" },
      ],
    }),
  component: PayoutRequest,
});
