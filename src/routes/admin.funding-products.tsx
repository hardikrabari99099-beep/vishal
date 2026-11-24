import { createFileRoute } from "@tanstack/react-router";
import AdminFundingProducts from "@/views/admin/AdminFundingProducts";

export const Route = createFileRoute("/admin/funding-products")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Funding Products — IndiFunded Admin" },
      {
        name: "description",
        content:
          "Manage Instant Funding and 1-Step Challenge rules, pricing, and automated risk.",
      },
      { property: "og:title", content: "Funding Products — IndiFunded Admin" },
      {
        property: "og:description",
        content:
          "Manage Instant Funding and 1-Step Challenge rules, pricing, and automated risk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminFundingProducts,
});
