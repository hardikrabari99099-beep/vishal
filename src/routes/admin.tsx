import { createFileRoute } from "@tanstack/react-router";
import AdminLayout from "@/views/admin/AdminLayout";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () =>
    buildRouteHead({
      title: "Admin | IndiFunded",
      description: "IndiFunded admin panel.",
      path: "/admin",
      noindex: true,
    }),
  component: AdminLayout,
});
