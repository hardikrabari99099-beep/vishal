import { createFileRoute } from "@tanstack/react-router";
import { Blog } from "@/views/SimplePages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/blog/")({
  head: () =>
    buildRouteHead({
      title: "Indian Prop Trading Blog & Market Guides | IndiFunded",
      description:
        "Read trading insights, Nifty and Bank Nifty risk management guides, and funded trader program updates from the IndiFunded team.",
      path: "/blog",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Blog", path: "/blog" },
      ],
    }),
  component: Blog,
});
