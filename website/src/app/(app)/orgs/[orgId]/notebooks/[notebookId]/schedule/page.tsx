"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CalendarView from "@/components/pages/CalendarView";
import { store } from "@/lib/store";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";

function SchedulePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgId, notebookId } = useNotebookWorkspace();
  const base = `/orgs/${orgId}/notebooks/${notebookId}`;

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
      router.replace(`${base}/schedule?date=${encodeURIComponent(date)}&view=${view}`);
    }
  }, [searchParams, base, router]);

  return <CalendarView onClose={() => router.push(base)} />;
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<p className="text-nb-body text-nb-on-surface-variant">Loading schedule…</p>}>
      <SchedulePageInner />
    </Suspense>
  );
}
