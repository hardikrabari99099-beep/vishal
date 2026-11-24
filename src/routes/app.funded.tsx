import { createFileRoute } from "@tanstack/react-router";
import { FundedAccount } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/funded")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Funded Account — IndiFunded" },
      {
        name: "description",
        content: "IndiFunded trader dashboard: funded account.",
      },
      { property: "og:title", content: "Funded Account — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: funded account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FundedAccount,
});
