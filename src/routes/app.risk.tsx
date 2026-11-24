import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/app/risk")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Evaluation Progress — IndiFunded" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Navigate to="/app/evaluation" replace />,
});
