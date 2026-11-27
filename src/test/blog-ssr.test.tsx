import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/context/SettingsContext";
import { Blog, BlogDetail } from "@/views/SimplePages";
import { handleApi } from "@/server/api-handler";
import { Route as BlogDetailFileRoute } from "@/routes/_site.blog.$slug";

async function getPublishedBlogsFromApi() {
  const res = await handleApi(
    new Request("https://indifunded.com/api/blogs", { method: "GET" }),
    "blogs",
  );
  expect(res.ok).toBe(true);
  const data = await res.json();
  expect(Array.isArray(data)).toBe(true);
  expect(data.length).toBeGreaterThanOrEqual(3);
  return data as Array<{
    id: string;
    slug: string;
    title: string;
    excerpt?: string;
    content?: string;
    cover_image?: string;
    author?: string;
    created_at?: string;
  }>;
}

describe("Blog SSR and Soft-404 prevention", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("renders all published blog cards in SSR HTML on /blog", async () => {
    const blogs = await getPublishedBlogsFromApi();

    const rootRoute = createRootRoute({
      component: () => (
        <QueryClientProvider client={new QueryClient()}>
          <SettingsProvider>
            <Blog initialBlogs={blogs} />
          </SettingsProvider>
        </QueryClientProvider>
      ),
    });
    const blogRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/blog",
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([blogRoute]),
      history: createMemoryHistory({ initialEntries: ["/blog"] }),
    });
    await router.load();

    const html = renderToString(<RouterProvider router={router} />);
    expect(html).not.toContain("Loading…");
    for (const post of blogs) {
      expect(html).toContain(`/blog/${post.slug}`);
      expect(html).toContain(post.title);
    }
  });

  it("renders full article content in SSR HTML and hydrates cleanly without Loading… for every published blog", async () => {
    const blogs = await getPublishedBlogsFromApi();

    for (const post of blogs) {
      const detailRes = await handleApi(
        new Request(
          `https://indifunded.com/api/blogs/${encodeURIComponent(post.slug)}`,
          { method: "GET" },
        ),
        `blogs/${encodeURIComponent(post.slug)}`,
      );
      expect(detailRes.ok).toBe(true);
      const article = await detailRes.json();

      const buildTree = () => {
        const rootRoute = createRootRoute({
          component: () => (
            <QueryClientProvider client={new QueryClient()}>
              <SettingsProvider>
                <BlogDetail key={article.slug} initialBlog={article} />
              </SettingsProvider>
            </QueryClientProvider>
          ),
        });
        const detailRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: "/blog/$slug",
          component: () => null,
        });
        return rootRoute.addChildren([detailRoute]);
      };

      const ssrRouter = createRouter({
        routeTree: buildTree(),
        history: createMemoryHistory({
          initialEntries: [`/blog/${post.slug}`],
        }),
      });
      await ssrRouter.load();

      const origWin = globalThis.window;
      // @ts-expect-error simulate server environment for renderToString
      delete globalThis.window;
      let ssrHtml = "";
      try {
        ssrHtml = renderToString(<RouterProvider router={ssrRouter} />);
      } finally {
        globalThis.window = origWin;
      }

      expect(ssrHtml).not.toContain("Loading…");
      expect(ssrHtml).toContain(article.title);
      expect(ssrHtml).toContain(article.author);
      expect(ssrHtml).toContain("Explore Trading Challenges");

      const clientRouter = createRouter({
        routeTree: buildTree(),
        history: createMemoryHistory({
          initialEntries: [`/blog/${post.slug}`],
        }),
      });
      await clientRouter.load();

      const container = document.createElement("div");
      container.innerHTML = ssrHtml;
      document.body.appendChild(container);

      const recoverableErrors: unknown[] = [];
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      let hydratedRoot: ReturnType<typeof hydrateRoot> | null = null;
      await act(async () => {
        hydratedRoot = hydrateRoot(
          container,
          <RouterProvider router={clientRouter} />,
          {
            onRecoverableError: (err) => recoverableErrors.push(err),
          },
        );
      });

      const hydrationErrors = errorSpy.mock.calls.filter((args) =>
        args.some((a) => /hydrat|didn't match/i.test(String(a))),
      );
      expect(recoverableErrors).toEqual([]);
      expect(hydrationErrors).toEqual([]);
      expect(container.textContent).not.toContain("Loading…");
      expect(container.textContent).toContain(article.title);

      await act(async () => {
        hydratedRoot?.unmount();
      });
      container.remove();
      errorSpy.mockRestore();
    }
  });

  it("populates article-specific head metadata and BlogPosting JSON-LD from loaderData", async () => {
    const blogs = await getPublishedBlogsFromApi();
    const post = blogs[0];
    const headResult = BlogDetailFileRoute.options.head?.({
      loaderData: { post },
      params: { slug: post.slug },
    } as never);

    const meta = headResult?.meta ?? [];
    expect(meta).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: `${post.title} | IndiFunded Blog` }),
        expect.objectContaining({
          name: "description",
          content: post.excerpt,
        }),
      ]),
    );
    const scripts = headResult?.scripts ?? [];
    const blogSchemaScript = scripts.find((s) =>
      String(s.children || "").includes('"@type":"BlogPosting"'),
    );
    expect(blogSchemaScript).toBeDefined();
    expect(String(blogSchemaScript?.children)).toContain(post.title);
  });
});
