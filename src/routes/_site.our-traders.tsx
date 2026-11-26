import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/our-traders")({
  head: () =>
    buildRouteHead({
      title: "IndiFunded",
      description: "IndiFunded trader community.",
      path: "/our-traders",
      noindex: true,
    }),
  component: () => <Navigate to="/" replace />,
});
