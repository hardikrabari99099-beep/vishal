import { createFileRoute } from "@tanstack/react-router";
import TradingJournal from "@/views/app/TradingJournal";

export const Route = createFileRoute("/app/journal")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Trading Journal — IndiFunded" },
      {
        name: "description",
        content:
          "Log manual trades, strategy tags, execution notes, and chart screenshots.",
      },
      { property: "og:title", content: "Trading Journal — IndiFunded" },
      {
        property: "og:description",
        content:
          "Log manual trades, strategy tags, execution notes, and chart screenshots.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TradingJournal,
});
