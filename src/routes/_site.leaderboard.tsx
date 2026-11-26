import { createFileRoute } from "@tanstack/react-router";
import Leaderboard from "@/views/Leaderboard";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/leaderboard")({
  head: () =>
    buildRouteHead({
      title: "Funded Trader Leaderboard India | IndiFunded",
      description:
        "View top-performing funded traders in India on IndiFunded ranked by verified lifetime payouts and evaluation milestones.",
      path: "/leaderboard",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Leaderboard", path: "/leaderboard" },
      ],
    }),
  component: Leaderboard,
});
