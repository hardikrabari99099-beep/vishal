import { createFileRoute } from "@tanstack/react-router";
import { Kyc } from "@/views/app/TraderScreens";

export const Route = createFileRoute("/app/kyc")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "KYC Verification — IndiFunded" },
      {
        name: "description",
        content: "IndiFunded trader dashboard: kyc verification.",
      },
      { property: "og:title", content: "KYC Verification — IndiFunded" },
      {
        property: "og:description",
        content: "IndiFunded trader dashboard: kyc verification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Kyc,
});
