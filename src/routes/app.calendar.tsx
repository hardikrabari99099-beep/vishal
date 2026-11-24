import { createFileRoute } from "@tanstack/react-router";
import { TradingCalendar } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/calendar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Trading Calendar — IndiFunded" },
      {
        name: "description",
        content: "IndiFunded trader dashboard: trading calendar.",
      },
      { property: "og:title", content: "Trading Calendar — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: trading calendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TradingCalendar,
});
