import { createFileRoute } from "@tanstack/react-router";
import { CredentialVerify } from "@/views/ExtraPages";

export const Route = createFileRoute("/_site/verify/$code")({
  head: () => ({
    meta: [
      { title: "Verify Certificate — IndiFunded" },
      {
        name: "description",
        content: "Scan-to-verify page for IndiFunded certificates and awards.",
      },
      { property: "og:title", content: "Verify Certificate — IndiFunded" },
      {
        property: "og:description",
        content: "Scan-to-verify page for IndiFunded certificates and awards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { code } = Route.useParams();
  return <CredentialVerify code={code} />;
}
