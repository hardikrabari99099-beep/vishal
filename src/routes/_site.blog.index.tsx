import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Blog } from "@/views/SimplePages";
import { buildRouteHead, SITE_URL } from "@/lib/seo";

const fetchPublishedBlogs = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const { handleApi } = await import("@/server/api-handler");
      const res = await handleApi(
        new Request(`${SITE_URL}/api/blogs`, { method: "GET" }),
        "blogs",
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
);

function BlogIndexRoute() {
  const { blogs } = Route.useLoaderData();
  return <Blog initialBlogs={blogs} />;
}

export const Route = createFileRoute("/_site/blog/")({
  loader: async () => {
    const blogs = await fetchPublishedBlogs();
    return { blogs };
  },
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
  component: BlogIndexRoute,
});
