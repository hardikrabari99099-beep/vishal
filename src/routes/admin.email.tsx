import { createFileRoute } from "@tanstack/react-router";
import AdminEmail from "@/views/admin/AdminEmail";

export const Route = createFileRoute("/admin/email")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Business Gmail Automation — IndiFunded Admin" },
      {
        name: "description",
        content:
          "Automate Business Gmail welcome emails on trader sign-up and login.",
      },
      {
        property: "og:title",
        content: "Business Gmail Automation — IndiFunded Admin",
      },
      {
        property: "og:description",
        content:
          "Automate Business Gmail welcome emails on trader sign-up and login.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEmail,
});
