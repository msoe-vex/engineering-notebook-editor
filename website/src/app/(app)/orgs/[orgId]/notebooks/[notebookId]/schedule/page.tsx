"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CalendarView from "@/components/pages/CalendarView";
import { workspaceState } from "@/lib/cloud/workspaceState";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";

function SchedulePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgId, notebookId } = useNotebookWorkspace();
  const base = `/orgs/${orgId}/notebooks/${notebookId}`;

  useEffect(() => {
    const date =
      searchParams.get("date") ||
      workspaceState.calendarCursor ||
      new Date().toISOString().slice(0, 10);
    const view = searchParams.get("view") === "week" ? "week" : "month";
    workspaceState.setCalendar(date, view);

    if (!searchParams.get("date") || !searchParams.get("view")) {
      router.replace(`${base}/schedule?date=${encodeURIComponent(date)}&view=${view}`);
    }
  }, [searchParams, base, router]);

  return <CalendarView onClose={() => router.push(base)} />;
}

export default function SchedulePage() {
  return (
    <Suspense
      fallback={
        <p className="p-4 text-nb-body text-nb-on-surface-variant md:p-6">Loading schedule…</p>
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <SchedulePageInner />
      </div>
    </Suspense>
  );
}
