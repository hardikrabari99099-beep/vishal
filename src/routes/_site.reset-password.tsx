import { createFileRoute } from "@tanstack/react-router";
import { ResetPassword } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/reset-password")({
  head: () =>
    buildRouteHead({
      title: "Reset Password | IndiFunded",
      description: "Choose a new password for your IndiFunded account.",
      path: "/reset-password",
      noindex: true,
    }),
  component: ResetPassword,
});
