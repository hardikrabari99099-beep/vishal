import { createFileRoute } from "@tanstack/react-router";
import Layout from "@/components/Layout";
import { buildOrganizationSchema, buildWebSiteSchema } from "@/lib/seo";

export const Route = createFileRoute("/_site")({
  head: () => ({
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(buildOrganizationSchema()),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(buildWebSiteSchema()),
      },
    ],
  }),
  component: Layout,
});
