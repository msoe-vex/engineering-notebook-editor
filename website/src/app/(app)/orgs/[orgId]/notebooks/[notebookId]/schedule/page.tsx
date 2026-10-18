"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CalendarView from "@/components/pages/CalendarView";
import { CalendarPageSkeleton } from "@/components/cloud/notebookPageSkeletons";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { workspaceState } from "@/lib/cloud/workspaceState";
import { getLocalDateString } from "@/lib/utils";

function SchedulePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgId, notebookId } = useNotebookWorkspace();
  const base = `/orgs/${orgId}/notebooks/${notebookId}`;

  useEffect(() => {
    const date =
      searchParams.get("date") ||
      workspaceState.calendarCursor ||
      getLocalDateString();
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
    <Suspense fallback={<CalendarPageSkeleton />}>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <SchedulePageInner />
      </div>
    </Suspense>
  );
}
