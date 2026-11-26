import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/terms")({
  head: () =>
    buildRouteHead({
      title: "Terms and Conditions | IndiFunded",
      description:
        "Review the terms and conditions governing IndiFunded trading evaluation challenges, funded accounts, rules compliance, and profit sharing.",
      path: "/terms",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Terms and Conditions", path: "/terms" },
      ],
    }),
  component: () => <PolicyPage kind="terms" />,
});
