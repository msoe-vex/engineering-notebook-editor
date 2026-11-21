import {
  memberPath,
  teamMemberPath,
  type NotebookAccess,
  type NotebookSummary,
  type OrgRole,
  type PlatformRole,
} from "@engineering-notebook/shared";
import type { SessionUser } from "./auth/authPort.js";
import { getMetadataStore } from "./db/metadataStore.js";

const ROLE_RANK: Record<OrgRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export function isServiceAdmin(user: SessionUser): boolean {
  return user.platformRole === "service_admin";
}

export type OrgMembership = {
  role: OrgRole;
  status: "active" | "alumni";
};

export async function getOrgMembership(orgId: string, uid: string): Promise<OrgMembership | null> {
  const data = await getMetadataStore().get(memberPath(orgId, uid));
  if (!data) return null;
  const role = (data.role as OrgRole) ?? null;
  if (!role) return null;
  const status = data.status === "alumni" ? "alumni" : "active";
  return { role, status };
}

export async function getOrgRole(orgId: string, uid: string): Promise<OrgRole | null> {
  const m = await getOrgMembership(orgId, uid);
  return m?.role ?? null;
}

export async function requireOrgMember(
  user: SessionUser,
  orgId: string,
  minRole: OrgRole = "member",
  opts?: { allowAlumni?: boolean }
): Promise<OrgRole> {
  if (isServiceAdmin(user)) return "owner";
  const membership = await getOrgMembership(orgId, user.uid);
  if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    const err = new Error("forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  if (membership.status === "alumni" && !opts?.allowAlumni) {
    const err = new Error("alumni_readonly");
    (err as Error & { statusCode: number; code?: string }).statusCode = 403;
    (err as Error & { code?: string }).code = "alumni_readonly";
    throw err;
  }
  return membership.role;
}

/** Read-only org access (active or alumni). */
export async function requireOrgReader(user: SessionUser, orgId: string): Promise<OrgRole> {
  return requireOrgMember(user, orgId, "member", { allowAlumni: true });
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
  notebook: Pick<NotebookSummary, "access"> | { access?: NotebookAccess },
  orgRole?: OrgRole | null
): Promise<boolean> {
  if (isServiceAdmin(user)) return true;
  const role = orgRole ?? (await getOrgRole(orgId, user.uid));
  if (!role) return false;
  if (role === "owner" || role === "admin") return true;

  const access = normalizeAccess(notebook.access);
  if (access.mode === "org") return true;

  if (access.userIds.includes(user.uid)) return true;

  const store = getMetadataStore();
  for (const teamId of access.teamIds) {
    const tm = await store.get(teamMemberPath(orgId, teamId, user.uid));
    if (tm) return true;
  }
  return false;
}

export async function requireNotebookAccess(
  user: SessionUser,
  orgId: string,
  notebook: Pick<NotebookSummary, "access"> | { access?: NotebookAccess },
  opts?: { write?: boolean }
): Promise<OrgRole> {
  const role = await requireOrgMember(user, orgId, "member", {
    allowAlumni: opts?.write === false,
  });
  const ok = await canAccessNotebook(user, orgId, notebook, role);
  if (!ok) {
    const err = new Error("forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return role;
}

export function assertNotebookNotArchived(
  notebook: { archivedAt?: string | null }
): void {
  if (notebook.archivedAt) {
    const err = new Error("This notebook is archived and read-only");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
}

export type { PlatformRole };
