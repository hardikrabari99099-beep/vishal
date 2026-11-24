import { createFileRoute } from "@tanstack/react-router";
import AdminAiEditor from "@/views/admin/AdminAiEditor";

export const Route = createFileRoute("/admin/ai-editor")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AI Site Studio — IndiFunded Admin" },
      {
        name: "description",
        content:
          "Edit any IndiFunded site content, rules, plans, coupons, and blogs using AI.",
      },
      { property: "og:title", content: "AI Site Studio — IndiFunded Admin" },
      {
        property: "og:description",
        content:
          "Edit any IndiFunded site content, rules, plans, coupons, and blogs using AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAiEditor,
});
