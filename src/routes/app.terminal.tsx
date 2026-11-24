import { createFileRoute } from "@tanstack/react-router";
import { TradingTerminal } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/terminal")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Trading Terminal — IndiFunded" },
      {
        name: "description",
        content: "IndiFunded trader dashboard: trading terminal.",
      },
      { property: "og:title", content: "Trading Terminal — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: trading terminal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TradingTerminal,
});
