"use client";

import { useRouter } from "next/navigation";
import SettingsPage from "@/components/pages/SettingsPage";

export default function AccountPreferencesPage() {
  const router = useRouter();
  return <SettingsPage isEmbedded onClose={() => router.push("/")} />;
}