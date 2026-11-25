"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  cloudApi,
  type InviteSummary,
  type MemberSummary,
  type CloudNotebookSummary,
  type OrgSummary,
  type TeamSummary,
} from "@/lib/cloud/api";
import { formatCloudError, isForbiddenError, isNotFoundError } from "@/lib/cloud/errors";
import { showNotification } from "@/components/overlays/Notification";
import { isOrgAdminRole } from "@/lib/cloud/roles";

type OrgWorkspaceState = {
  orgId: string;
  org: OrgSummary | null;
  notebooks: CloudNotebookSummary[];
  teams: TeamSummary[];
  members: MemberSummary[];
  invites: InviteSummary[];
  pendingInviteCount: number;
  error: string | null;
  busy: boolean;
  /** False until the first org + notebooks payload lands. */
  initialLoaded: boolean;
  /** True after members/teams/invites have been fetched (or failed) for this org. */
  directoryLoaded: boolean;
  /** Org missing or forbidden — show empty state instead of tabs/content. */
  orgUnavailable: boolean;
  canManage: boolean;
  canDeleteOrg: boolean;
  refresh: () => void;
  /** Re-fetch members/teams/invites without blocking notebook list. */
  refreshDirectory: () => void;
  setError: (message: string | null) => void;
  setBusy: (busy: boolean) => void;
};

const OrgWorkspaceContext = createContext<OrgWorkspaceState | null>(null);

export function OrgWorkspaceProvider({
  orgId,
  children,
}: {
  orgId: string;
  children: ReactNode;
}) {
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [notebooks, setNotebooks] = useState<CloudNotebookSummary[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [error, setErrorState] = useState<string | null>(null);
  const [orgUnavailable, setOrgUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [directoryToken, setDirectoryToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);
  const refreshDirectory = useCallback(() => setDirectoryToken((n) => n + 1), []);

  const setError = useCallback((message: string | null) => {
    setErrorState(message);
    if (message) showNotification(formatCloudError(message), "error");
  }, []);

  // Core shell: org + notebooks only (fast first paint).
  useEffect(() => {
    let cancelled = false;
    setInitialLoaded(false);
    setDirectoryLoaded(false);
    setOrgUnavailable(false);
    queueMicrotask(() => {
      void (async () => {
        try {
          const [o, n] = await Promise.all([
            cloudApi.getOrg(orgId),
            cloudApi.listNotebooks(orgId),
          ]);
          if (cancelled) return;
          setOrg(o);
          setNotebooks(n);
          setOrgUnavailable(false);
          setErrorState(null);
        } catch (err) {
          if (cancelled) return;
          setOrg(null);
          setNotebooks([]);
          setTeams([]);
          setMembers([]);
          setInvites([]);
          setOrgUnavailable(true);
          setErrorState(formatCloudError(err, "Organization unavailable"));
          if (!isNotFoundError(err) && !isForbiddenError(err)) {
            showNotification(formatCloudError(err), "error");
          }
        } finally {
          if (!cancelled) setInitialLoaded(true);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, reloadToken]);

  // Directory (members / teams / invites) loads after shell — or on explicit refreshDirectory.
  useEffect(() => {
    if (!initialLoaded || orgUnavailable) return;
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          const [m, t] = await Promise.all([
            cloudApi.listMembers(orgId),
            cloudApi.listTeams(orgId).catch(() => [] as TeamSummary[]),
          ]);
          let inv: InviteSummary[] = [];
          try {
            inv = await cloudApi.listInvites(orgId);
          } catch {
            inv = [];
          }
          if (cancelled) return;
          setMembers(m);
          setTeams(t);
          setInvites(inv);
        } catch {
          if (cancelled) return;
          // Keep prior directory data; shell remains usable.
        } finally {
          if (!cancelled) setDirectoryLoaded(true);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, initialLoaded, orgUnavailable, reloadToken, directoryToken]);

  const value = useMemo<OrgWorkspaceState>(
    () => ({
      orgId,
      org,
      notebooks,
      teams,
      members,
      invites,
      pendingInviteCount: invites.filter(
        (i) => (i.status ?? (i.acceptedAt ? "accepted" : "pending")) === "pending"
      ).length,
      error,
      busy,
      initialLoaded,
      directoryLoaded,
      orgUnavailable,
      canManage: isOrgAdminRole(org?.role),
      canDeleteOrg: org?.role === "owner",
      refresh,
      refreshDirectory,
      setError,
      setBusy,
    }),
    [
      orgId,
      org,
      notebooks,
      teams,
      members,
      invites,
      error,
      busy,
      initialLoaded,
      directoryLoaded,
      orgUnavailable,
      refresh,
      refreshDirectory,
      setError,
    ]
  );

  return (
    <OrgWorkspaceContext.Provider value={value}>{children}</OrgWorkspaceContext.Provider>
  );
}

export function useOrgWorkspace(): OrgWorkspaceState {
  const ctx = useContext(OrgWorkspaceContext);
  if (!ctx) throw new Error("useOrgWorkspace must be used under OrgWorkspaceProvider");
  return ctx;
}
