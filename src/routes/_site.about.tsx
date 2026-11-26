import { createFileRoute } from "@tanstack/react-router";
import { About } from "@/views/SimplePages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/about")({
  head: () =>
    buildRouteHead({
      title: "About IndiFunded | Proprietary Trading Firm India",
      description:
        "IndiFunded, operated by BRVS Education Pvt Ltd, is an Indian prop trading firm empowering disciplined Nifty and equity traders with funded trading accounts.",
      path: "/about",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "About Us", path: "/about" },
      ],
    }),
  component: About,
});
