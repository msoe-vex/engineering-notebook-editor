"use client";

import { useParams, useRouter } from "next/navigation";
import HelpPage from "@/components/pages/HelpPage";

export default function HelpRoutePage() {
  const router = useRouter();
  const params = useParams();
  const tabParam = params.tab;
  const tab = Array.isArray(tabParam) ? tabParam[0] : typeof tabParam === "string" ? tabParam : undefined;
  const path = tab ? `/help/${tab}` : "/help";

  return (
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
  );
}
