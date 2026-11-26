import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/privacy")({
  head: () =>
    buildRouteHead({
      title: "Privacy Policy | IndiFunded",
      description:
        "Learn how IndiFunded and BRVS Education Pvt Ltd collect, protect, and manage your personal account and trading verification data.",
      path: "/privacy",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Privacy Policy", path: "/privacy" },
      ],
    }),
  component: () => <PolicyPage kind="privacy" />,
});
