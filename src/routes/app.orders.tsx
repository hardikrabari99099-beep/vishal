import { createFileRoute } from "@tanstack/react-router";
import { Orders } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/orders")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Orders — IndiFunded" },
      { name: "description", content: "IndiFunded trader dashboard: orders." },
      { property: "og:title", content: "Orders — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: orders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Orders,
});
