"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CalendarView from "@/components/pages/CalendarView";
import { store } from "@/lib/store";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";

function CalendarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgId, notebookId } = useNotebookWorkspace();

  useEffect(() => {
    const date =
      searchParams.get("date") ||
      store.calendarCursor ||
      new Date().toISOString().slice(0, 10);
    const view = searchParams.get("view") === "week" ? "week" : "month";
    store.calendarCursor = date;
    store.calendarMode = view;
    store.showCalendar = true;
    store.notifyStateChange();

    if (!searchParams.get("date") || !searchParams.get("view")) {
      router.replace(
        `/orgs/${orgId}/notebooks/${notebookId}/calendar?date=${encodeURIComponent(date)}&view=${view}`
      );
    }
  }, [searchParams, orgId, notebookId, router]);

  return (
    <CalendarView
      onClose={() => router.push(`/orgs/${orgId}/notebooks/${notebookId}`)}
    />
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading calendar…</p>}>
      <CalendarPageInner />
    </Suspense>
  );
}
