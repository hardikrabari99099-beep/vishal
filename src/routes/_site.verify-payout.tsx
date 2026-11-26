import { createFileRoute } from "@tanstack/react-router";
import { VerifyPayout } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/verify-payout")({
  head: () =>
    buildRouteHead({
      title: "Verify Payout Certificate & QR Proof | IndiFunded",
      description:
        "Verify any published IndiFunded trader payout by Payout ID, Certificate ID, or QR scan for transparent payout verification.",
      path: "/verify-payout",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Verify Payout", path: "/verify-payout" },
      ],
    }),
  component: VerifyPayout,
});
