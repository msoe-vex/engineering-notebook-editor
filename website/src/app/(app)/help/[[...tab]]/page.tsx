"use client";

import { useParams, useRouter } from "next/navigation";
import HelpPage from "@/components/pages/HelpPage";
import { PageHeader } from "@/components/ui";

export default function HelpRoutePage() {
  const router = useRouter();
  const params = useParams();
  const tabParam = params.tab;
  const tab = Array.isArray(tabParam) ? tabParam[0] : typeof tabParam === "string" ? tabParam : undefined;
  const path = tab ? `/help/${tab}` : "/help";

  return (
    <div className="font-sans">
      <PageHeader
        backHref="/"
        backLabel="Organizations"
        title="Help"
        description="How to use the engineering notebook editor."
      />
      <div className="overflow-hidden rounded-2xl border border-nb-outline-variant/30 bg-nb-surface">
        <HelpPage
          path={path}
          isEmbedded
          onClose={() => router.push("/")}
          navigateTo={(_p, pathname) => {
            if (pathname?.startsWith("/help")) router.push(pathname);
            else if (pathname) router.push(pathname);
            else router.push("/help");
          }}
        />
      </div>
    </div>
  );
}
