"use client";

import { useRouter } from "next/navigation";
import AboutPage from "@/components/pages/AboutPage";

export default function AboutRoutePage() {
  const router = useRouter();

  return (
    <AboutPage
      isEmbedded
      onClose={() => router.push("/")}
      onTryIt={() => router.push("/")}
      onOpenHelp={() => router.push("/help")}
    />
  );
}
