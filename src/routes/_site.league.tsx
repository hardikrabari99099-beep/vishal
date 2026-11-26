import { createFileRoute } from "@tanstack/react-router";
import TraderLeague from "@/views/TraderLeague";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/league")({
  head: () =>
    buildRouteHead({
      title: "IndiFunded Trader League Competition | IndiFunded",
      description:
        "Register for the IndiFunded Trader League to compete against Indian options and index traders with transparent scoring and UPI registration.",
      path: "/league",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Trader League", path: "/league" },
      ],
    }),
  component: TraderLeague,
});
