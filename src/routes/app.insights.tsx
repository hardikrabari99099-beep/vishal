import { createFileRoute } from "@tanstack/react-router";
import UserInsights from "@/views/app/UserInsights";

export const Route = createFileRoute("/app/insights")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AI Performance Insights — IndiFunded Trader" },
      {
        name: "description",
        content:
          "Personalised AI review of your trading history with clear next steps.",
      },
      {
        property: "og:title",
        content: "AI Performance Insights — IndiFunded Trader",
      },
      {
        property: "og:description",
        content:
          "Personalised AI review of your trading history with clear next steps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UserInsights,
});
