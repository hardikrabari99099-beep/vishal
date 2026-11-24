import { createFileRoute } from "@tanstack/react-router";
import UserReferral from "@/views/app/UserReferral";

export const Route = createFileRoute("/app/refer")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Refer a friend — IndiFunded" },
      {
        name: "description",
        content: "Refer traders and earn rewards on IndiFunded.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UserReferral,
});
