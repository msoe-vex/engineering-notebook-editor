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
  type NotebookSummary,
  type OrgSummary,
  type TeamSummary,
} from "@/lib/cloud/api";
import { formatCloudError, isForbiddenError, isNotFoundError } from "@/lib/cloud/errors";
import { showNotification } from "@/components/overlays/Notification";
import { isOrgAdminRole } from "@/lib/cloud/roles";

type OrgWorkspaceState = {
  orgId: string;
  org: OrgSummary | null;
  notebooks: NotebookSummary[];
  teams: TeamSummary[];
  members: MemberSummary[];
  invites: InviteSummary[];
  pendingInviteCount: number;
  error: string | null;
  busy: boolean;
  /** False until the first org payload lands. */
  initialLoaded: boolean;
  /** Org missing or forbidden — show empty state instead of tabs/content. */
  orgUnavailable: boolean;
  canManage: boolean;
  canDeleteOrg: boolean;
  refresh: () => void;
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
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [error, setErrorState] = useState<string | null>(null);
  const [orgUnavailable, setOrgUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  const setError = useCallback((message: string | null) => {
    setErrorState(message);
    if (message) showNotification(formatCloudError(message), "error");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setInitialLoaded(false);
    setOrgUnavailable(false);
    queueMicrotask(() => {
      void (async () => {
        try {
          const [o, n, m, t] = await Promise.all([
            cloudApi.getOrg(orgId),
            cloudApi.listNotebooks(orgId),
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
          setOrg(o);
          setNotebooks(n);
          setTeams(t);
          setMembers(m);
          setInvites(inv);
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

  const value = useMemo<OrgWorkspaceState>(
    () => ({
      orgId,
      org,
      notebooks,
      teams,
      members,
      invites,
      pendingInviteCount: invites.filter((i) => !i.acceptedAt).length,
      error,
      busy,
      initialLoaded,
      orgUnavailable,
      canManage: isOrgAdminRole(org?.role),
      canDeleteOrg: org?.role === "owner",
      refresh,
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
      orgUnavailable,
      refresh,
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
