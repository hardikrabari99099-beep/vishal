import { createFileRoute } from "@tanstack/react-router";
import { EvaluationProgress } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/evaluation")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Evaluation Progress — IndiFunded" },
      {
        name: "description",
        content: "IndiFunded trader dashboard: evaluation progress.",
      },
      { property: "og:title", content: "Evaluation Progress — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: evaluation progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EvaluationProgress,
});
