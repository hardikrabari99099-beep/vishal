import { createFileRoute } from "@tanstack/react-router";
import { Notifications } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/notifications")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Notifications — IndiFunded" },
      {
        name: "description",
        content: "IndiFunded trader dashboard: notifications.",
      },
      { property: "og:title", content: "Notifications — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: notifications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Notifications,
});
