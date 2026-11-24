import { createFileRoute } from "@tanstack/react-router";
import { Support } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/support")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Support — IndiFunded" },
      { name: "description", content: "IndiFunded trader dashboard: support." },
      { property: "og:title", content: "Support — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: support.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Support,
});
