import { createFileRoute } from "@tanstack/react-router";
import { CredentialVerify } from "@/views/ExtraPages";
import { buildRouteHead } from "@/lib/seo";

export const Route = createFileRoute("/_site/verify/$code")({
  head: ({ params }) =>
    buildRouteHead({
      title: "Verify Certificate | IndiFunded",
      description:
        "Scan-to-verify page for IndiFunded certificates and awards.",
      path: `/verify/${params.code}`,
      noindex: true,
    }),
  component: VerifyPage,
});

function VerifyPage() {
  const { code } = Route.useParams();
  return <CredentialVerify code={code} />;
}
