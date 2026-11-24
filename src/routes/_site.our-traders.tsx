import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_site/our-traders")({
  head: () => ({
    meta: [{ title: "IndiFunded" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Navigate to="/" replace />,
});
