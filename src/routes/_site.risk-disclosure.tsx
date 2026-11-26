import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/risk-disclosure")({
  head: () =>
    buildRouteHead({
      title: "Risk Disclosure | IndiFunded",
      description:
        "Read the IndiFunded trading risk disclosure outlining financial market risks, educational simulation boundaries, and trader responsibility.",
      path: "/risk-disclosure",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Risk Disclosure", path: "/risk-disclosure" },
      ],
    }),
  component: () => <PolicyPage kind="risk" />,
});
