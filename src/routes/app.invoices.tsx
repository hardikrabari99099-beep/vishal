import { createFileRoute } from "@tanstack/react-router";
import UserInvoices from "@/views/app/UserInvoices";

export const Route = createFileRoute("/app/invoices")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Invoices — IndiFunded" },
      {
        name: "description",
        content: "Billing history and invoices on IndiFunded.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UserInvoices,
});
