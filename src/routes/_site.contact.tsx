import { createFileRoute } from "@tanstack/react-router";
import { Contact } from "@/views/SimplePages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/contact")({
  head: () =>
    buildRouteHead({
      title: "Contact IndiFunded Support & Help Desk | IndiFunded",
      description:
        "Raise a support ticket or reach the IndiFunded team in Surat via email or WhatsApp for help with trading challenges, KYC, and funded account payouts.",
      path: "/contact",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Contact Us", path: "/contact" },
      ],
    }),
  component: Contact,
});
