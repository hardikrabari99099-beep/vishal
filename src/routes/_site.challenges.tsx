import { createFileRoute } from "@tanstack/react-router";
import Challenges from "@/views/Challenges";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/challenges")({
  head: () =>
    buildRouteHead({
      title: "Trading Challenges & Funded Accounts India | IndiFunded",
      description:
        "Compare Indian stock market trading challenges, Nifty and Bank Nifty evaluation plans, Instant Funding, and 1-Step accounts up to ₹10,00,000.",
      path: "/challenges",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Trading Challenges", path: "/challenges" },
      ],
    }),
  component: Challenges,
});
