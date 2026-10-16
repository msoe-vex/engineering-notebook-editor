"use client";

import { useRouter } from "next/navigation";
import AboutPage from "@/components/pages/AboutPage";

export default function AboutRoutePage() {
  const router = useRouter();

  return (
    <div className="-mx-6 -my-8 lg:-my-12">
      <AboutPage
        onClose={() => router.push("/")}
        onTryIt={() => router.push("/")}
        onOpenHelp={() => router.push("/help")}
      />
    </div>
  );
}
