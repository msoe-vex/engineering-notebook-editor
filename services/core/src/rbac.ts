import {
  memberPath,
  orgPath,
  teamMemberPath,
  type NotebookAccess,
  type NotebookSummaryV5,
  type OrgRole,
  type PlatformRole,
} from "@engineering-notebook/shared";
import type { SessionUser } from "./auth/authPort.js";
import { getFirestore } from "./db/firestore.js";

const ROLE_RANK: Record<OrgRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export function isServiceAdmin(user: SessionUser): boolean {
  return user.platformRole === "service_admin";
}

export async function getOrgRole(orgId: string, uid: string): Promise<OrgRole | null> {
  const snap = await getFirestore().doc(memberPath(orgId, uid)).get();
  if (!snap.exists) return null;
  return (snap.data()?.role as OrgRole) ?? null;
}

export async function requireOrgMember(
  user: SessionUser,
  orgId: string,
  minRole: OrgRole = "member"
): Promise<OrgRole> {
  if (isServiceAdmin(user)) return "owner";
  const role = await getOrgRole(orgId, user.uid);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    const err = new Error("forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return role;
}

export function requireServiceAdmin(user: SessionUser): void {
  if (!isServiceAdmin(user)) {
    const err = new Error("forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
}

function normalizeAccess(access: NotebookAccess | undefined): NotebookAccess {
  return {
    mode: access?.mode === "restricted" ? "restricted" : "org",
    teamIds: access?.teamIds ?? [],
    userIds: access?.userIds ?? [],
  };
}

/** True if the user may open this notebook (owners/admins always). */
export async function canAccessNotebook(
  user: SessionUser,
  orgId: string,
  notebook: Pick<NotebookSummaryV5, "access"> | { access?: NotebookAccess },
  orgRole?: OrgRole | null
): Promise<boolean> {
  if (isServiceAdmin(user)) return true;
  const role = orgRole ?? (await getOrgRole(orgId, user.uid));
  if (!role) return false;
  if (role === "owner" || role === "admin") return true;

  const access = normalizeAccess(notebook.access);
  if (access.mode === "org") return true;

  if (access.userIds.includes(user.uid)) return true;

  for (const teamId of access.teamIds) {
    const snap = await getFirestore().doc(teamMemberPath(orgId, teamId, user.uid)).get();
    if (snap.exists) return true;
  }
  return false;
}

export async function requireNotebookAccess(
  user: SessionUser,
  orgId: string,
  notebook: Pick<NotebookSummaryV5, "access"> | { access?: NotebookAccess }
): Promise<OrgRole> {
  const role = await requireOrgMember(user, orgId);
  const ok = await canAccessNotebook(user, orgId, notebook, role);
  if (!ok) {
    const err = new Error("forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return role;
}

export type { PlatformRole };
