import { createFileRoute } from "@tanstack/react-router";
import { AdminTickets } from "@/views/admin/AdminPages";

export const Route = createFileRoute("/admin/tickets")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Support Tickets — IndiFunded Admin" },
      {
        name: "description",
        content: "IndiFunded admin client support ticket management.",
      },
      { property: "og:title", content: "Support Tickets — IndiFunded Admin" },
      {
        property: "og:description",
        content: "IndiFunded admin client support ticket management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTickets,
});
