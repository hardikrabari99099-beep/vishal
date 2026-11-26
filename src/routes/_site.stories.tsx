import { createFileRoute } from "@tanstack/react-router";
import { TraderStories } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/stories")({
  head: () =>
    buildRouteHead({
      title: "Funded Trader Stories & Reviews India | IndiFunded",
      description:
        "Read trader experiences, funded account journeys, and payout stories shared by participants in IndiFunded trading challenges across India.",
      path: "/stories",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Trader Stories", path: "/stories" },
      ],
    }),
  component: TraderStories,
});
