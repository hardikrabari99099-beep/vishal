import { createFileRoute } from "@tanstack/react-router";
import { TradeBook } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/tradebook")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Trade Book — IndiFunded" },
      {
        name: "description",
        content: "IndiFunded trader dashboard: trade book.",
      },
      { property: "og:title", content: "Trade Book — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: trade book.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TradeBook,
});
