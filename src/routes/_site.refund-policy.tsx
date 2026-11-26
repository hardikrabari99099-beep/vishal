import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/refund-policy")({
  head: () =>
    buildRouteHead({
      title: "Refund Policy | IndiFunded",
      description:
        "Read the IndiFunded challenge fee refund policy covering pre-activation review windows, duplicate UPI transactions, and evaluation terms.",
      path: "/refund-policy",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Refund Policy", path: "/refund-policy" },
      ],
    }),
  component: () => <PolicyPage kind="refund" />,
});
