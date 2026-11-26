import { createFileRoute } from "@tanstack/react-router";
import { BlogDetail } from "@/views/SimplePages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/blog/$slug")({
  head: ({ params }) =>
    buildRouteHead({
      title: "Trading Guide & Insights | IndiFunded Blog",
      description:
        "Read trading evaluation insights, risk management strategies, and updates for Indian funded traders on the IndiFunded blog.",
      path: `/blog/${params.slug}`,
      type: "article",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Blog", path: "/blog" },
        { name: "Article", path: `/blog/${params.slug}` },
      ],
    }),
  component: BlogDetail,
});
