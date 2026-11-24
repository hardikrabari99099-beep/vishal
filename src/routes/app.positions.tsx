import { createFileRoute } from "@tanstack/react-router";
import { Positions } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/positions")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Positions — IndiFunded" },
      {
        name: "description",
        content: "IndiFunded trader dashboard: positions.",
      },
      { property: "og:title", content: "Positions — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: positions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Positions,
});
