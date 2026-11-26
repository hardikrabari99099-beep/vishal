import { createFileRoute } from "@tanstack/react-router";
import CheckoutSuccess from "@/views/CheckoutSuccess";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/checkout/success")({
  head: () =>
    buildRouteHead({
      title: "Payment Received | IndiFunded",
      description: "Your IndiFunded challenge payment status.",
      path: "/checkout/success",
      noindex: true,
    }),
  component: CheckoutSuccess,
});
