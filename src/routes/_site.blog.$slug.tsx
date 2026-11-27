import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { BlogDetail } from "@/views/SimplePages";
import { buildRouteHead, DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/seo";

export interface BlogArticleRecord {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  content?: string;
  cover_image?: string;
  author?: string;
  published?: boolean;
  created_at?: string;
  updated_at?: string;
}

const fetchBlogBySlug = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => String(slug || "").trim())
  .handler(async ({ data: slug }): Promise<BlogArticleRecord | null> => {
    if (!slug) return null;
    try {
      const encoded = encodeURIComponent(slug);
      const { handleApi } = await import("@/server/api-handler");
      const res = await handleApi(
        new Request(`${SITE_URL}/api/blogs/${encoded}`, { method: "GET" }),
        `blogs/${encoded}`,
      );
      if (!res.ok) return null;
      return (await res.json()) as BlogArticleRecord;
    } catch {
      return null;
    }
  });

function BlogDetailRoute() {
  const { post } = Route.useLoaderData();
  return <BlogDetail key={post.slug} initialBlog={post} />;
}

function BlogPostNotFound() {
  return (
    <div className="container-xl py-24">
      Post not found.{" "}
      <Link to="/blog" className="text-[var(--accent)]">
        Back to blog
      </Link>
    </div>
  );
}

export const Route = createFileRoute("/_site/blog/$slug")({
  loader: async ({ params }) => {
    const post = await fetchBlogBySlug({ data: params.slug });
    if (!post) {
      throw notFound();
    }
    return { post };
  },
  head: ({ loaderData, params }) => {
    const post = loaderData?.post;
    const articlePath = `/blog/${params.slug}`;
    const articleUrl = `${SITE_URL}${articlePath}`;
    const title = post?.title
      ? `${post.title} | IndiFunded Blog`
      : "Trading Guide & Insights | IndiFunded Blog";
    const description =
      post?.excerpt ||
      "Read trading evaluation insights, risk management strategies, and updates for Indian funded traders on the IndiFunded blog.";
    const extraSchemas = post?.title
      ? [
          {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.excerpt || post.title,
            image: post.cover_image || DEFAULT_OG_IMAGE,
            author: {
              "@type": "Organization",
              name: post.author || "IndiFunded Team",
            },
            publisher: {
              "@type": "Organization",
              name: "IndiFunded",
              url: `${SITE_URL}/`,
            },
            ...(post.created_at ? { datePublished: post.created_at } : {}),
            ...(post.updated_at || post.created_at
              ? { dateModified: post.updated_at || post.created_at }
              : {}),
            mainEntityOfPage: {
              "@type": "WebPage",
              "@id": articleUrl,
            },
          },
        ]
      : [];

    return buildRouteHead({
      title,
      description,
      path: articlePath,
      type: "article",
      image: post?.cover_image || undefined,
      noindex: !post,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Blog", path: "/blog" },
        { name: post?.title || "Article", path: articlePath },
      ],
      extraSchemas,
    });
  },
  notFoundComponent: BlogPostNotFound,
  component: BlogDetailRoute,
});
