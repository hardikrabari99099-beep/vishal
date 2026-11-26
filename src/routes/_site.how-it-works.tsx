import { createFileRoute } from "@tanstack/react-router";
import { HowItWorksPage } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/how-it-works")({
  head: () =>
    buildRouteHead({
      title: "How Funded Trader Evaluation Works in India | IndiFunded",
      description:
        "Learn the 4-step IndiFunded trading evaluation program from virtual challenge onboarding to same-day funded account activation and 24-hour payout requests.",
      path: "/how-it-works",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "How It Works", path: "/how-it-works" },
      ],
    }),
  component: HowItWorksPage,
});
